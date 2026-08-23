export function diagnoseNodes(nodes) {
  const reports = [];

  for (const node of nodes) {
    const issues = [];
    if (!node.address || node.address === 'unknown') {
      issues.push('آدرس سرور مفقود یا نامعتبر است.');
    }
    if (!node.port || isNaN(parseInt(node.port, 10))) {
      issues.push('پورت سرور نامعتبر است.');
    }
    if ((node.protocol === 'vless' || node.protocol === 'vmess') && (!node.auth || node.auth.length < 10)) {
      issues.push('شناسه UUID نامعتبر است.');
    }
    if (node.security === 'reality' && !node.pbk) {
      issues.push('پروتکل Reality بدون کلید عمومی (pbk) تنظیم شده است.');
    }

    reports.push({
      nodeId: node.id,
      nodeName: node.name,
      protocol: node.protocol,
      healthy: issues.length === 0,
      issues
    });
  }

  return reports;
}
