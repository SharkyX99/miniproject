import { createClient } from '@supabase/supabase-js';

// เก็บข้อมูลลง temperature_logs ทุกกี่นาที (ปรับได้ตามต้องการ)
const LOG_INTERVAL_MINUTES = 30;

// เก็บข้อมูลย้อนหลังไว้กี่วัน (เก่ากว่านี้จะถูกลบทิ้งอัตโนมัติ)
const RETENTION_DAYS = 5;

// คืนวันที่ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD
function todayBangkok() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok'
    }).format(new Date());
}

// คืนช่วงเวลาเริ่ม/สิ้นสุดของ "วัน" ตามเวลาไทย (00:00 - 23:59:59.999)
// เป็น ISO string (+07:00) สำหรับใช้ query timestamptz ใน Supabase
function bangkokDayRange(dateStr) {
    return {
        start: new Date(`${dateStr}T00:00:00.000+07:00`).toISOString(),
        end: new Date(`${dateStr}T23:59:59.999+07:00`).toISOString()
    };
}

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

                    // ลบข้อมูลที่เก่ากว่า RETENTION_DAYS วัน
                    // (ทำเฉพาะตอนที่เพิ่งบันทึกใหม่ พอครับ
                    // ไม่ต้องเช็คทุก request)
                    const cutoff = new Date(
                        Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
                    ).toISOString();

                    const { error: cleanupError } = await supabase
                        .from('temperature_logs')
                        .delete()
                        .lt('recorded_at', cutoff);

                    if (cleanupError) {
                        console.error(
                            'Cleanup Error:',
                            cleanupError
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

                // รับ ?date=YYYY-MM-DD (เวลาไทย) ถ้าไม่ส่งมา
                // ใช้วันนี้ (เวลาไทย) เป็นค่า default
                const requestedDate = req.query.date;
                const validFormat =
                    typeof requestedDate === 'string' &&
                    /^\d{4}-\d{2}-\d{2}$/.test(requestedDate);

                const targetDate = validFormat
                    ? requestedDate
                    : todayBangkok();

                // กันไม่ให้ดึงข้อมูลเก่าเกิน RETENTION_DAYS
                // (เพราะยังไงก็ถูกลบไปแล้วจากตาราง)
                const oldestAllowed = new Date(
                    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
                );
                const oldestAllowedStr =
                    new Intl.DateTimeFormat('en-CA', {
                        timeZone: 'Asia/Bangkok'
                    }).format(oldestAllowed);

                const finalDate =
                    targetDate < oldestAllowedStr
                        ? oldestAllowedStr
                        : targetDate;

                const { start, end } = bangkokDayRange(finalDate);

                const {
                    data,
                    error
                } = await supabase
                    .from('temperature_logs')
                    .select(
                        'temperature, humidity, recorded_at'
                    )
                    .gte('recorded_at', start)
                    .lte('recorded_at', end)
                    .order(
                        'recorded_at',
                        {
                            ascending: true
                        }
                    );

                if (error) {
                    throw error;
                }

                return res.status(200).json({
                    date: finalDate,
                    history: data || []
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