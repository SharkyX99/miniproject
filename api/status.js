import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    // ถ้าขาด Key ให้แจ้งเตือนชัดเจน
    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({
            error: 'Environment Variables missing!',
            hasUrl: !!supabaseUrl,
            hasKey: !!supabaseKey
        });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

            if (body.action === 'esp32_update') {
                const { error: updateError } = await supabase
                    .from('system_state')
                    .update({
                        temp: body.temp ?? 0,
                        hum: body.hum ?? 0,
                        relay: body.relay ?? false,
                        updated_at: new Date()
                    })
                    .eq('id', 1);

                if (updateError) throw updateError;

                const { data, error: selectError } = await supabase
                    .from('system_state')
                    .select('mode, trigger_watering')
                    .eq('id', 1)
                    .single();

                if (selectError) throw selectError;

                return res.status(200).json({
                    mode: data?.mode || 0,
                    triggerWatering: data?.trigger_watering || false
                });
            }

            return res.status(200).json({ status: 'ok' });
        }

        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('system_state')
                .select('*')
                .eq('id', 1)
                .single();

            if (error) throw error;

            return res.status(200).json({
                temp: data.temp,
                hum: data.hum,
                relay: data.relay,
                mode: data.mode,
                triggerWatering: data.trigger_watering
            });
        }

        return res.status(200).json({ status: 'ok' });

    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ error: err.message, details: err });
    }
}