import { supabase } from './supabase';
import { detectCountry } from './pricing';

export async function sendReminder(appointment: any) {
  const country = await detectCountry();

  if (country === 'TR') {
    await fetch('https://hemensalon.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: appointment.customer.phone,
        message: `Randevunuz yarın ${appointment.time}`,
      }),
    });
  } else {
    await supabase.functions.invoke('send-email', {
      body: {
        to: appointment.customer.email,
        subject: 'Appointment Reminder',
        text: `Your appointment is tomorrow at ${appointment.time}`,
      },
    });
  }
}
