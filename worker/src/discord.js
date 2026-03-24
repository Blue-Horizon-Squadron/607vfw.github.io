export async function postDiscord(webhookUrl, data) {
  const isUpdate = Boolean(data.updated);
  const roleChanged = Boolean(data.role_changed);

  const fields = [
    { name: 'Operation', value: data.operation_name || data.operation_id, inline: false },
    { name: 'Pilot', value: data.callsign || '—', inline: true },
    { name: 'Discord', value: data.discord || '—', inline: true },
  ];

  if (isUpdate) {
    fields.push({ name: 'Action', value: 'Updated registration', inline: true });
  } else {
    fields.push({ name: 'Action', value: 'New registration', inline: true });
  }

  if (roleChanged && data.previous_role_key) {
    fields.push({ name: 'Role (previous)', value: String(data.previous_role_key).split('|')[0] || '—', inline: true });
    fields.push({ name: 'Aircraft (previous)', value: String(data.previous_role_key).split('|')[1] || '—', inline: true });
  }

  fields.push(
    { name: 'Role', value: data.role || '—', inline: true },
    { name: 'Aircraft', value: data.aircraft || '—', inline: true },
    { name: 'Experience', value: data.experience || 'Not specified', inline: true },
    { name: 'Notes', value: data.notes || '—', inline: false }
  );

  const embed = {
    embeds: [{
      title: 'Operation Registration',
      color: isUpdate ? 0xf2c94c : 0x2d9cdb,
      fields,
      footer: { text: `BHS · ${new Date().toISOString()}` }
    }]
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(embed)
  });
}
