import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // ตั้งค่า CORS ให้รองรับทุก Origin และทุก Method
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // ตอบกลับ Preflight Request (OPTIONS) ทันที
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({
            error: 'Missing SUPABASE_URL or SUPABASE_KEY in Environment Variables'
        });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // 1. จัดการ POST Request (จาก ESP32 หรือ Dashboard)
        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

            // ESP32 อัปเดตค่า Temp/Hum/Relay
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

            // Dashboard เปลี่ยนโหมด (0=Manual, 1=Timer, 2=Sensor)
            if (body.action === 'set_mode') {
                await supabase
                    .from('system_state')
                    .update({ mode: body.mode })
                    .eq('id', 1);

                return res.status(200).json({ success: true, mode: body.mode });
            }

            // Dashboard สั่งรดน้ำ
            if (body.action === 'toggle_watering') {
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

            // กรณี POST อื่นๆ ส่ง OK กลับไป
            return res.status(200).json({ status: 'ok' });
        }

        // 2. จัดการ GET Request (หน้าเว็บดึงข้อมูลไปโชว์)
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('system_state')
                .select('*')
                .eq('id', 1)
                .single();

            if (error) {
                return res.status(200).json({
                    temp: 0,
                    hum: 0,
                    relay: false,
                    mode: 0,
                    triggerWatering: false
                });
            }

            return res.status(200).json({
                temp: data.temp,
                hum: data.hum,
                relay: data.relay,
                mode: data.mode,
                triggerWatering: data.trigger_watering
            });
        }

        // กรณี Method อื่นๆ (เช่น PUT/DELETE) ให้คืน 200 แทน 405 เพื่อไม่ให้ ESP32 ฟ้อง error
        return res.status(200).json({ status: 'ok' });

    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ error: err.message });
    }
}