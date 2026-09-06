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
    // ENVIRONMENT VARIABLES
    // =====================================================

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl) {
        console.error('ERROR: SUPABASE_URL is missing');

        return res.status(500).json({
            error: 'SUPABASE_URL is missing'
        });
    }

    if (!supabaseKey) {
        console.error('ERROR: SUPABASE_KEY is missing');

        return res.status(500).json({
            error: 'SUPABASE_KEY is missing'
        });
    }


    // =====================================================
    // SUPABASE CLIENT
    // =====================================================

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

            console.log('========== POST REQUEST ==========');
            console.log('Method:', req.method);
            console.log('Body:', body);


            // ---------------------------------------------
            // Parse JSON ถ้า body เป็น String
            // ---------------------------------------------

            if (typeof body === 'string') {

                try {

                    body = JSON.parse(body);

                } catch (error) {

                    console.error(
                        'JSON PARSE ERROR:',
                        error
                    );

                    return res.status(400).json({
                        error: 'Invalid JSON body'
                    });
                }
            }


            if (!body) {
                body = {};
            }


            console.log(
                'Action:',
                body.action
            );


            // =================================================
            // ESP32 UPDATE
            // =================================================

            if (
                body.action ===
                'esp32_update'
            ) {

                console.log(
                    '========== ESP32 UPDATE =========='
                );


                const temp =
                    Number(body.temp ?? 0);

                const hum =
                    Number(body.hum ?? 0);

                const relay =
                    Boolean(
                        body.relay ?? false
                    );


                console.log(
                    'Temp:',
                    temp
                );

                console.log(
                    'Hum:',
                    hum
                );

                console.log(
                    'Relay:',
                    relay
                );


                // ---------------------------------------------
                // UPDATE DATABASE
                // ---------------------------------------------

                const {
                    error: updateError
                } = await supabase
                    .from('system_state')
                    .update({

                        temp: temp,

                        hum: hum,

                        relay: relay,

                        updated_at:
                            new Date().toISOString()

                    })
                    .eq('id', 1);


                if (updateError) {

                    console.error(
                        'SUPABASE UPDATE ERROR:',
                        updateError
                    );

                    return res.status(500).json({

                        error:
                            updateError.message,

                        code:
                            updateError.code

                    });
                }


                console.log(
                    'SUPABASE UPDATE SUCCESS'
                );


                // ---------------------------------------------
                // READ CURRENT SYSTEM STATE
                // ---------------------------------------------

                const {
                    data,
                    error: selectError
                } = await supabase
                    .from('system_state')
                    .select(
                        'mode, trigger_watering'
                    )
                    .eq('id', 1)
                    .single();


                if (selectError) {

                    console.error(
                        'SUPABASE SELECT ERROR:',
                        selectError
                    );

                    return res.status(500).json({

                        error:
                            selectError.message,

                        code:
                            selectError.code

                    });
                }


                console.log(
                    'SYSTEM STATE:',
                    data
                );


                const mode =
                    Number(
                        data?.mode ?? 0
                    );


                const triggerWatering =
                    Boolean(
                        data?.trigger_watering ??
                        false
                    );


                // ---------------------------------------------
                // RESPONSE TO ESP32
                // ---------------------------------------------

                const response = {

                    mode: mode,

                    triggerWatering:
                        triggerWatering,

                    duration: 10000

                };


                console.log(
                    'RESPONSE:',
                    response
                );


                return res.status(200).json(
                    response
                );
            }


            // =================================================
            // SET MODE
            // =================================================

            if (
                body.action ===
                'set_mode'
            ) {

                const mode =
                    Number(body.mode);


                if (
                    mode !== 0 &&
                    mode !== 1 &&
                    mode !== 2
                ) {

                    return res.status(400).json({

                        error:
                            'Invalid mode. Use 0, 1 or 2.'

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

            if (
                body.action ===
                'toggle_watering'
            ) {

                const {
                    data,
                    error
                } = await supabase
                    .from('system_state')
                    .select(
                        'trigger_watering'
                    )
                    .eq('id', 1)
                    .single();


                if (error) {
                    throw error;
                }


                const newState =
                    !Boolean(
                        data?.trigger_watering
                    );


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
                            new Date().toISOString()

                    })
                    .eq('id', 1);


                if (error) {
                    throw error;
                }


                return res.status(200).json({

                    success: true,

                    triggerWatering:
                        false

                });
            }


            // =================================================
            // UNKNOWN ACTION
            // =================================================

            return res.status(200).json({

                status: 'ok',

                message:
                    'Unknown or no action'

            });
        }


        // =====================================================
        // GET
        // =====================================================

        if (req.method === 'GET') {

            console.log(
                '========== GET SYSTEM STATE =========='
            );


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
                    data.trigger_watering

            });
        }


        // =====================================================
        // OTHER METHODS
        // =====================================================

        return res.status(405).json({

            error:
                'Method Not Allowed'

        });


    } catch (err) {

        console.error(
            '========== API CRASH =========='
        );

        console.error(err);

        return res.status(500).json({

            error:
                err?.message ||
                'Internal Server Error'

        });
    }
}