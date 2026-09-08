import { createClient } from '@supabase/supabase-js';

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

                const temp =
                    Number(body.temp ?? 0);

                const hum =
                    Number(body.hum ?? 0);

                const relay =
                    Boolean(body.relay ?? false);


                // Update database
                const {
                    error: updateError
                } = await supabase
                    .from('system_state')
                    .update({
                        temp: temp,
                        hum: hum,
                        relay: relay,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', 1);


                if (updateError) {
                    console.error(
                        'UPDATE ERROR:',
                        updateError
                    );

                    return res.status(500).json({
                        error: updateError.message,
                        code: updateError.code
                    });
                }


                // ดึงข้อมูลแบบไม่ใช้ .single()
                const {
                    data,
                    error: selectError
                } = await supabase
                    .from('system_state')
                    .select('mode, trigger_watering')
                    .eq('id', 1)
                    .limit(1);


                if (selectError) {
                    console.error(
                        'SELECT ERROR:',
                        selectError
                    );

                    return res.status(500).json({
                        error: selectError.message,
                        code: selectError.code
                    });
                }


                // ถ้าไม่มี row ให้ใช้ค่า default
                const state =
                    data && data.length > 0
                        ? data[0]
                        : {
                            mode: 0,
                            trigger_watering: false
                        };


                const mode =
                    Number(state.mode ?? 0);

                const triggerWatering =
                    Boolean(
                        state.trigger_watering ?? false
                    );


                console.log(
                    'ESP32:',
                    temp,
                    hum,
                    relay
                );

                console.log(
                    'MODE:',
                    mode
                );

                console.log(
                    'TRIGGER:',
                    triggerWatering
                );


                return res.status(200).json({

                    mode: mode,

                    triggerWatering:
                        triggerWatering,

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


        // =================================================
        // GET
        // =================================================

        if (req.method === 'GET') {

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


        return res.status(405).json({
            error: 'Method Not Allowed'
        });


    } catch (err) {

        console.error(
            'API ERROR:',
            err
        );

        return res.status(500).json({
            error:
                err?.message ||
                'Internal Server Error'
        });
    }
}