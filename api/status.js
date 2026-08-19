import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

    // ==========================================
    // CORS
    // ==========================================

    res.setHeader(
        'Access-Control-Allow-Origin',
        '*'
    );

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


    // ==========================================
    // SUPABASE
    // ==========================================

    const supabaseUrl =
        process.env.SUPABASE_URL;

    const supabaseKey =
        process.env.SUPABASE_KEY;


    if (!supabaseUrl || !supabaseKey) {

        return res.status(500).json({
            error:
                'Missing Supabase Environment Variables'
        });
    }


    const supabase =
        createClient(
            supabaseUrl,
            supabaseKey
        );


    try {

        // ======================================
        // POST
        // ======================================

        if (req.method === 'POST') {

            let body = req.body;


            // รองรับ body ที่เป็น String

            if (typeof body === 'string') {

                try {

                    body = JSON.parse(body);

                } catch (e) {

                    body = {};
                }
            }


            body = body || {};


            // ======================================
            // ESP32 UPDATE
            // ======================================

            if (body.action === 'esp32_update') {

                // ==========================================
                // 1. อัปเดตสถานะ ESP32
                // ==========================================

                const { data: currentState, error: readError } =
                    await supabase
                        .from('system_state')
                        .select('mode, trigger_watering')
                        .eq('id', 1)
                        .single();

                if (readError) {
                    throw readError;
                }


                // ==========================================
                // 2. อัปเดต Sensor + Relay
                // ==========================================

                const { error: updateError } =
                    await supabase
                        .from('system_state')
                        .update({
                            temp: body.temp ?? 0,
                            hum: body.hum ?? 0,
                            relay: body.relay ?? false,
                            updated_at: new Date()
                        })
                        .eq('id', 1);

                if (updateError) {
                    throw updateError;
                }


                // ==========================================
                // 3. ตรวจสอบคำสั่ง START
                // ==========================================

                const triggerWatering =
                    currentState?.trigger_watering ?? false;


                // ==========================================
                // 4. ถ้า ESP32 ยังไม่ได้เปิด Relay
                //    และ Dashboard สั่ง START
                //    ให้ส่ง START กลับไป
                // ==========================================

                if (
                    triggerWatering === true &&
                    body.relay === false
                ) {

                    return res.status(200).json({

                        mode:
                            currentState?.mode ?? 0,

                        triggerWatering:
                            true,

                        duration:
                            10000
                    });
                }


                // ==========================================
                // 5. ถ้า ESP32 เปิด Relay แล้ว
                //    แสดงว่ารับคำสั่ง START ไปแล้ว
                //
                //    RESET trigger_watering
                // ==========================================

                if (
                    triggerWatering === true &&
                    body.relay === true
                ) {

                    const { error: resetError } =
                        await supabase
                            .from('system_state')
                            .update({
                                trigger_watering: false,
                                updated_at: new Date()
                            })
                            .eq('id', 1);

                    if (resetError) {
                        throw resetError;
                    }


                    return res.status(200).json({

                        mode:
                            currentState?.mode ?? 0,

                        triggerWatering:
                            false,

                        duration:
                            10000
                    });
                }


                // ==========================================
                // 6. ไม่มีคำสั่ง START
                // ==========================================

                return res.status(200).json({

                    mode:
                        currentState?.mode ?? 0,

                    triggerWatering:
                        false,

                    duration:
                        10000
                });
            }


            // ======================================
            // SET MODE
            // ======================================

            if (
                body.action ===
                'set_mode'
            ) {

                const mode =
                    Number(body.mode);


                if (
                    mode < 0 ||
                    mode > 2
                ) {

                    return res.status(400).json({
                        error:
                            'Invalid mode'
                    });
                }


                const {
                    error
                } = await supabase

                    .from('system_state')

                    .update({

                        mode: mode

                    })

                    .eq('id', 1);


                if (error) {
                    throw error;
                }


                // ----------------------------------
                // ถ้าเปลี่ยนออกจาก Manual
                // ให้ยกเลิก START เดิม
                // ----------------------------------

                if (mode !== 0) {

                    await supabase

                        .from('system_state')

                        .update({

                            trigger_watering:
                                false

                        })

                        .eq('id', 1);
                }


                return res.status(200).json({

                    success: true,

                    mode: mode
                });
            }


            // ======================================
            // START WATERING
            // ======================================

            if (
                body.action ===
                'start_watering'
            ) {

                const {
                    error
                } = await supabase

                    .from('system_state')

                    .update({

                        trigger_watering:
                            true

                    })

                    .eq('id', 1);


                if (error) {
                    throw error;
                }


                return res.status(200).json({

                    success: true,

                    triggerWatering: true
                });
            }


            // ======================================
            // STOP WATERING
            // ======================================

            if (
                body.action ===
                'stop_watering'
            ) {

                const {
                    error
                } = await supabase

                    .from('system_state')

                    .update({

                        trigger_watering:
                            false

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


            // ======================================
            // OLD TOGGLE API
            // ======================================

            if (
                body.action ===
                'toggle_watering'
            ) {

                const {
                    data,
                    error: getError
                } = await supabase

                    .from('system_state')

                    .select(
                        'trigger_watering'
                    )

                    .eq('id', 1)

                    .single();


                if (getError) {
                    throw getError;
                }


                const newState =
                    !data?.trigger_watering;


                const {
                    error: updateError
                } = await supabase

                    .from('system_state')

                    .update({

                        trigger_watering:
                            newState

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


            return res.status(200).json({
                status: 'ok'
            });
        }


        // ======================================
        // GET
        // ======================================

        if (req.method === 'GET') {

            const {
                data,
                error
            } = await supabase

                .from('system_state')

                .select('*')

                .eq('id', 1)

                .single();


            if (error) {
                throw error;
            }


            return res.status(200).json({

                temp:
                    data.temp,

                hum:
                    data.hum,

                relay:
                    data.relay,

                mode:
                    data.mode,

                triggerWatering:
                    data.trigger_watering,

                updatedAt:
                    data.updated_at
            });
        }


        return res.status(405).json({
            error: 'Method Not Allowed'
        });


    } catch (err) {

        console.error(
            'API Error:',
            err
        );


        return res.status(500).json({

            error:
                err.message
        });
    }
}