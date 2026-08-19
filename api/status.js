import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

            // 1. ESP32 อัปเดตค่า Temp/Hum/Relay และดึงคำสั่งกลับไป
            if (body?.action === 'esp32_update') {
                await supabase
                    .from('system_state')
                    .update({
                        temp: body.temp,
                        hum: body.hum,
                        relay: body.relay,
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

            // 2. Dashboard เปลี่ยนโหมด (Manual / Timer / Sensor)
            if (body?.action === 'set_mode') {
                await supabase
                    .from('system_state')
                    .update({ mode: body.mode })
                    .eq('id', 1);

                return res.status(200).json({ success: true, mode: body.mode });
            }

            // 3. Dashboard สั่งเปิด/ปิด รดน้ำ
            if (body?.action === 'toggle_watering') {
                const { data } = await supabase
                    .from('system_state')
                    .select('trigger_watering')
                    .eq('id', 1)
                    .single();

                const newState = !data?.trigger_watering;

                await supabase
                    .from('system_state')
                    .update({ trigger_watering: newState })
                    .eq('id', 1);

                return res.status(200).json({ success: true, triggerWatering: newState });
            }

            return res.status(200).json({ status: 'ok' });
        }

        // 4. Dashboard ดึงสถานะไปแสดงผลบนหน้าเว็บ
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

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('Supabase Error:', err);
        return res.status(500).json({ error: err.message });
    }
}