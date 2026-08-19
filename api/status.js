import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase Environment Variables' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        if (req.method === 'POST') {
            // แปลง body ป้องกัน crash จากการส่ง JSON ผิดรูปแบบ
            let body = req.body;
            if (typeof body === 'string') {
                try {
                    body = JSON.parse(body);
                } catch (e) {
                    body = {};
                }
            }
            body = body || {};

            // 1. ESP32 อัปเดตสถานะเซนเซอร์
            if (body.action === 'esp32_update') {
                await supabase
                    .from('system_state')
                    .update({
                        temp: body.temp ?? 0,
                        hum: body.hum ?? 0,
                        relay: body.relay ?? false,
                        updated_at: new Date()
                    })
                    .eq('id', 1);

                const { data } = await supabase
                    .from('system_state')
                    .select('mode, trigger_watering')
                    .eq('id', 1)
                    .single();

                return res.status(200).json({
                    mode: data?.mode || 0,
                    triggerWatering: data?.trigger_watering || false
                });
            }

            // 2. Dashboard สั่งเปลี่ยนโหมด (Manual / Timer / Sensor)
            if (body.action === 'set_mode') {
                const { error } = await supabase
                    .from('system_state')
                    .update({ mode: Number(body.mode) })
                    .eq('id', 1);

                if (error) throw error;
                return res.status(200).json({ success: true, mode: body.mode });
            }

            // 3. Dashboard สั่งสลับการรดน้ำ (Toggle Watering)
            if (body.action === 'toggle_watering') {
                const { data, error: getErr } = await supabase
                    .from('system_state')
                    .select('trigger_watering')
                    .eq('id', 1)
                    .single();

                if (getErr) throw getErr;

                const newState = !data?.trigger_watering;

                const { error: updateErr } = await supabase
                    .from('system_state')
                    .update({ trigger_watering: newState })
                    .eq('id', 1);

                if (updateErr) throw updateErr;

                return res.status(200).json({ success: true, triggerWatering: newState });
            }

            return res.status(200).json({ status: 'ok' });
        }

        // 4. GET Request - ดึงข้อมูลไปโชว์บนหน้าเว็บ
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
        return res.status(500).json({ error: err.message });
    }
}