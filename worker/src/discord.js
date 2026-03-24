export async function postDiscord(webhookUrl, data) {
  const embed = {
    embeds: [{
      title: '📋 Operation Registration',
      color: 0x2d9cdb,
      fields: [
        { name: 'Operation', value: data.operation_name || data.operation_id, inline: false },
        { name: 'Pilot', value: data.callsign || '—', inline: true },
        { name: 'Discord', value: data.discord || '—', inline: true },
        { name: 'Role', value: data.role || '—', inline: true },
        { name: 'Aircraft', value: data.aircraft || '—', inline: true },
        { name: 'Experience', value: data.experience || 'Not specified', inline: true },
        { name: 'Notes', value: data.notes || '—', inline: false },
      ],
      footer: { text: `BHS · ${new Date().toISOString()}` }
    }]
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(embed)
  });
}
