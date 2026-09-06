import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

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

            // ป้องกัน body เป็น String
            if (typeof body === 'string') {

                try {
                    body = JSON.parse(body);
                } catch (e) {
                    body = {};
                }

            }

            body = body || {};


            // =================================================
            // ESP32 UPDATE
            // =================================================

            if (body.action === 'esp32_update') {

                console.log('ESP32 UPDATE:', body);


                const { data: updateData, error: updateError } =
                    await supabase
                        .from('system_state')
                        .update({
                            temp: Number(body.temp ?? 0),
                            hum: Number(body.hum ?? 0),
                            relay: Boolean(body.relay ?? false),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', 1)
                        .select();


                // ตรวจสอบ Error จาก Supabase
                if (updateError) {

                    console.error(
                        'SUPABASE UPDATE ERROR:',
                        updateError
                    );

                    return res.status(500).json({
                        error: updateError.message
                    });
                }


                console.log(
                    'SUPABASE UPDATE OK:',
                    updateData
                );


                // =================================================
                // อ่าน MODE + TRIGGER
                // =================================================

                const { data, error: selectError } =
                    await supabase
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
                        error: selectError.message
                    });
                }


                const mode =
                    Number(data?.mode ?? 0);

                const triggerWatering =
                    Boolean(
                        data?.trigger_watering ?? false
                    );


                // =================================================
                // RESPONSE TO ESP32
                // =================================================

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

                if (![0, 1, 2].includes(mode)) {

                    return res.status(400).json({
                        error: 'Invalid mode'
                    });
                }


                const { error } =
                    await supabase
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

                const { data, error: getError } =
                    await supabase
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
                    !Boolean(
                        data?.trigger_watering
                    );


                const { error: updateError } =
                    await supabase
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

                const { error } =
                    await supabase
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

            const { data, error } =
                await supabase
                    .from('system_state')
                    .select('*')
                    .eq('id', 1)
                    .single();


            if (error) {
                throw error;
            }


            return res.status(200).json({

                temp: data.temp,

                hum: data.hum,

                relay: data.relay,

                mode: data.mode,

                triggerWatering:
                    data.trigger_watering

            });

        }


        return res.status(200).json({
            status: 'ok'
        });


    } catch (err) {

        console.error(
            'API ERROR:',
            err
        );

        return res.status(500).json({

            error:
                err.message ||
                'Internal Server Error'

        });

    }

}