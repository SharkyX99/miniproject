import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

    // =========================================
    // CORS
    // =========================================

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


    // =========================================
    // SUPABASE
    // =========================================

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

        // =========================================
        // POST
        // =========================================

        if (req.method === 'POST') {

            let body = req.body;


            if (typeof body === 'string') {

                try {

                    body = JSON.parse(body);

                } catch (e) {

                    body = {};
                }
            }


            body = body || {};


            // =========================================
            // ESP32 UPDATE
            // =========================================

            if (
                body.action ===
                'esp32_update'
            ) {

                // อ่านคำสั่งปัจจุบัน
                const {
                    data,
                    error
                } = await supabase

                    .from('system_state')

                    .select(
                        'mode, trigger_watering'
                    )

                    .eq('id', 1)

                    .single();


                if (error) {
                    throw error;
                }


                // อัปเดต sensor + relay
                const {
                    error: updateError
                } = await supabase

                    .from('system_state')

                    .update({

                        temp:
                            body.temp ?? 0,

                        hum:
                            body.hum ?? 0,

                        relay:
                            body.relay ?? false,

                        updated_at:
                            new Date()

                    })

                    .eq('id', 1);


                if (updateError) {
                    throw updateError;
                }


                // ส่ง command กลับ ESP32

                return res.status(200).json({

                    mode:
                        data?.mode ?? 0,

                    triggerWatering:
                        data?.trigger_watering
                        ?? false,

                    duration:
                        10000
                });
            }


            // =========================================
            // WATERING COMPLETE
            // =========================================

            if (
                body.action ===
                'watering_complete'
            ) {

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
                            new Date()

                    })

                    .eq('id', 1);


                if (error) {
                    throw error;
                }


                return res.status(200).json({

                    success:
                        true,

                    triggerWatering:
                        false
                });
            }


            // =========================================
            // SET MODE
            // =========================================

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

                        mode:
                            mode,

                        trigger_watering:
                            false

                    })

                    .eq('id', 1);


                if (error) {
                    throw error;
                }


                return res.status(200).json({

                    success:
                        true,

                    mode:
                        mode
                });
            }


            // =========================================
            // START WATERING
            // =========================================

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

                    success:
                        true,

                    triggerWatering:
                        true,

                    duration:
                        10000
                });
            }


            // =========================================
            // STOP WATERING
            // =========================================

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

                    success:
                        true,

                    triggerWatering:
                        false
                });
            }


            // =========================================
            // TOGGLE WATERING
            // =========================================

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

                    success:
                        true,

                    triggerWatering:
                        newState,

                    duration:
                        10000
                });
            }


            return res.status(200).json({

                status:
                    'ok'
            });
        }


        // =========================================
        // GET
        // =========================================

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

            error:
                'Method Not Allowed'
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