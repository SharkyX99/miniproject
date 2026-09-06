if (body.action === 'esp32_update') {

    console.log('========== ESP32 UPDATE ==========');
    console.log(body);

    // 1. ตรวจว่ามี row id = 1 จริงหรือไม่
    const { data: existing, error: findError } =
        await supabase
            .from('system_state')
            .select('id, mode, trigger_watering')
            .eq('id', 1)
            .single();

    if (findError) {
        console.error('FIND SYSTEM STATE ERROR:', findError);

        return res.status(500).json({
            error: findError.message,
            code: findError.code
        });
    }

    // 2. Update sensor + relay
    const { error: updateError } =
        await supabase
            .from('system_state')
            .update({
                temp: Number(body.temp ?? 0),
                hum: Number(body.hum ?? 0),
                relay: Boolean(body.relay ?? false),
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);

    if (updateError) {

        console.error(
            'UPDATE SYSTEM STATE ERROR:',
            updateError
        );

        return res.status(500).json({
            error: updateError.message,
            code: updateError.code
        });
    }

    // 3. ส่งค่ากลับ ESP32
    const { data, error: readError } =
        await supabase
            .from('system_state')
            .select('mode, trigger_watering')
            .eq('id', 1)
            .single();

    if (readError) {

        console.error(
            'READ SYSTEM STATE ERROR:',
            readError
        );

        return res.status(500).json({
            error: readError.message,
            code: readError.code
        });
    }

    const mode = Number(data.mode ?? 0);

    const triggerWatering =
        Boolean(data.trigger_watering ?? false);

    console.log(
        `MODE=${mode} TRIGGER=${triggerWatering}`
    );

    return res.status(200).json({
        mode: mode,
        triggerWatering: triggerWatering,
        duration: 10000
    });
}