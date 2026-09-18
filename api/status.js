import { createClient } from '@supabase/supabase-js';

// เก็บข้อมูลลง temperature_logs ทุกกี่นาที (ปรับได้ตามต้องการ)
const LOG_INTERVAL_MINUTES = 5;

export default async function handler(req, res) {

    // =====================================================
    // CORS
    // =====================================================

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, OPTIONS'
    );
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }


    // =====================================================
    // SUPABASE
    // =====================================================

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({
            error: 'Missing Supabase Environment Variables'
        });
    }

    const supabase = createClient(
        supabaseUrl,
        supabaseKey
    );


    try {

        // =================================================
        // POST
        // =================================================

        if (req.method === 'POST') {

            let body = req.body;

            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                } catch (e) {
                    return res.status(400).json({
                        error: 'Invalid JSON'
                    });
                }
            }

            body = body || {};


            // =================================================
            // ESP32 UPDATE
            // =================================================

            if (body.action === 'esp32_update') {

                const temp = Number(body.temp ?? 0);
                const hum = Number(body.hum ?? 0);
                const relay = Boolean(body.relay ?? false);


                // ---------------------------------------------
                // 1. Update current system state
                // ---------------------------------------------

                const { error: updateError } = await supabase
                    .from('system_state')
                    .update({
                        temp: temp,
                        hum: hum,
                        relay: relay,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', 1);

                if (updateError) {
                    throw updateError;
                }


                // ---------------------------------------------
                // 2. Save temperature history
                //    (บันทึกทุก LOG_INTERVAL_MINUTES นาที เท่านั้น
                //     กันไม่ให้ตาราง log บวมเร็วเกินไป)
                // ---------------------------------------------

                const { data: lastLogRows } = await supabase
                    .from('temperature_logs')
                    .select('recorded_at')
                    .order('recorded_at', { ascending: false })
                    .limit(1);

                let shouldLog = true;

                if (lastLogRows && lastLogRows.length > 0) {
                    const lastTime = new Date(
                        lastLogRows[0].recorded_at
                    ).getTime();
                    const minutesSinceLastLog =
                        (Date.now() - lastTime) / 60000;

                    shouldLog =
                        minutesSinceLastLog >= LOG_INTERVAL_MINUTES;
                }

                if (shouldLog) {
                    const { error: logError } = await supabase
                        .from('temperature_logs')
                        .insert({
                            temperature: temp,
                            humidity: hum
                        });

                    if (logError) {
                        console.error(
                            'Temperature Log Error:',
                            logError
                        );
                    }
                }


                // ---------------------------------------------
                // 3. Get current mode / command
                // ---------------------------------------------

                const {
                    data,
                    error: selectError
                } = await supabase
                    .from('system_state')
                    .select('mode, trigger_watering')
                    .eq('id', 1)
                    .limit(1);

                if (selectError) {
                    throw selectError;
                }


                const state =
                    data && data.length > 0
                        ? data[0]
                        : {
                            mode: 0,
                            trigger_watering: false
                        };


                return res.status(200).json({

                    mode: Number(state.mode ?? 0),

                    triggerWatering:
                        Boolean(
                            state.trigger_watering ?? false
                        ),

                    duration: 10000

                });
            }

            // =================================================
            // SET MODE
            // =================================================

            if (body.action === 'set_mode') {

                const mode =
                    Number(body.mode);


                if (
                    mode !== 0 &&
                    mode !== 1 &&
                    mode !== 2
                ) {
                    return res.status(400).json({
                        error: 'Invalid mode'
                    });
                }


                const {
                    error
                } = await supabase
                    .from('system_state')
                    .update({
                        mode: mode,
                        updated_at:
                            new Date().toISOString()
                    })
                    .eq('id', 1);


                if (error) {
                    throw error;
                }


                return res.status(200).json({
                    success: true,
                    mode: mode
                });
            }


            // =================================================
            // TOGGLE WATERING
            // =================================================

            if (body.action === 'toggle_watering') {

                const {
                    data,
                    error
                } = await supabase
                    .from('system_state')
                    .select('trigger_watering')
                    .eq('id', 1)
                    .limit(1);


                if (error) {
                    throw error;
                }


                const currentState =
                    data && data.length > 0
                        ? Boolean(
                            data[0].trigger_watering
                        )
                        : false;


                const newState =
                    !currentState;


                const {
                    error: updateError
                } = await supabase
                    .from('system_state')
                    .update({
                        trigger_watering:
                            newState,
                        updated_at:
                            new Date().toISOString()
                    })
                    .eq('id', 1);


                if (updateError) {
                    throw updateError;
                }


                return res.status(200).json({

                    success: true,

                    triggerWatering:
                        newState

                });
            }


            // =================================================
            // WATERING COMPLETE
            // =================================================

            if (body.action === 'watering_complete') {

                const {
                    error
                } = await supabase
                    .from('system_state')
                    .update({

                        trigger_watering:
                            false,

                        relay:
                            false,

                        updated_at:
                            new Date().toISOString()

                    })
                    .eq('id', 1);


                if (error) {
                    throw error;
                }


                return res.status(200).json({

                    success: true,

                    triggerWatering: false

                });
            }


            return res.status(200).json({
                status: 'ok'
            });
        }


        if (req.method === 'GET') {

            // =============================================
            // GET TEMPERATURE HISTORY
            // =============================================

            if (req.query.history === 'true') {

                // ดึง "ล่าสุด" N จุด (ค่า default = 288 จุด
                // ~1 วัน ถ้าเก็บทุก 5 นาที) แล้วเรียงกลับเป็น
                // เก่า -> ใหม่ ให้กราฟวาดจากซ้ายไปขวาถูกต้อง
                const requestedLimit = Number(req.query.limit);
                const pointLimit =
                    requestedLimit > 0 ? requestedLimit : 288;

                const {
                    data,
                    error
                } = await supabase
                    .from('temperature_logs')
                    .select(
                        'temperature, humidity, recorded_at'
                    )
                    .order(
                        'recorded_at',
                        {
                            ascending: false
                        }
                    )
                    .limit(pointLimit);

                if (error) {
                    throw error;
                }

                return res.status(200).json({
                    history: (data || []).reverse()
                });
            }


            // =============================================
            // CURRENT SYSTEM STATE
            // =============================================

            const {
                data,
                error
            } = await supabase
                .from('system_state')
                .select('*')
                .eq('id', 1)
                .limit(1);

            if (error) {
                throw error;
            }


            const state =
                data && data.length > 0
                    ? data[0]
                    : {
                        temp: 0,
                        hum: 0,
                        relay: false,
                        mode: 0,
                        trigger_watering: false
                    };


            return res.status(200).json({

                temp: state.temp,

                hum: state.hum,

                relay: state.relay,

                mode: state.mode,

                triggerWatering:
                    state.trigger_watering

            });
        }


        // =================================================
        // METHOD NOT ALLOWED
        // =================================================

        return res.status(405).json({
            error: 'Method not allowed'
        });

    } catch (error) {

        console.error('API Error:', error);

        return res.status(500).json({
            error: error.message || 'Internal server error'
        });
    }
}