const { marked } = require('marked');

// Helper to render inline markdown (like **bold**) safely inside JSON fields
function renderMarkdownInline(text) {
  if (!text) return '';
  return marked.parseInline(text);
}

function compileJsonToHtml(sectionId, data) {
  if (sectionId === 'home') {
    const bannerTitle = renderMarkdownInline(data.banner.title);
    const bannerLead = renderMarkdownInline(data.banner.lead);
    const bannerDesc = renderMarkdownInline(data.banner.desc);
    
    let featuresHtml = '';
    (data.features || []).forEach(f => {
      featuresHtml += `<div class="feat-card">
<div class="feat-card-header">
<span class="feat-card-id">${f.tag}</span>
<h4>${f.title}</h4>
</div>
<p>${renderMarkdownInline(f.desc)}</p>
</div>\n`;
    });

    let linksHtml = '';
    (data.links || []).forEach(l => {
      linksHtml += `<a href="${l.url}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
<div class="feat-card" style="height: 100%; border: 1px solid rgba(59, 130, 246, 0.15);">
<div class="feat-card-header">
<span class="feat-card-id">${l.tag}</span>
<h4 style="color: var(--color-cyan);">${l.title}</h4>
</div>
<p>${renderMarkdownInline(l.desc)}</p>
</div>
</a>\n`;
    });

    return `<section class="page-home animate-fade-in">
<div class="terminal-banner">
<h2 class="hero-title">${bannerTitle}</h2>
<p class="lead-text">${bannerLead}</p>
<p class="hero-desc">${bannerDesc}</p>
</div>

<!-- Feature Grids -->
<div class="features-grid">
${featuresHtml}</div>

<!-- External Links Grids -->
<div class="features-grid" style="margin-top: 1.75rem;">
${linksHtml}</div>
</section>`;
  }

  if (sectionId === 'curriculum') {
    const headerTitle = renderMarkdownInline(data.header.title);
    const headerDesc = renderMarkdownInline(data.header.desc);

    let phasesHtml = '';
    (data.phases || []).forEach((p, idx) => {
      let topicsHtml = '';
      (p.topics || []).forEach(t => {
        topicsHtml += `<li><span class="topic-dot"></span> ${renderMarkdownInline(t)}</li>\n`;
      });

      phasesHtml += `<div class="roadmap-card">
<div class="card-badge">${p.phase}</div>
<h3 class="card-title">${p.title}</h3>
<p class="card-desc">${renderMarkdownInline(p.desc)}</p>
<ul class="card-topics">
${topicsHtml}</ul>
</div>\n`;
    });

    return `<section id="curriculum" class="curriculum-view animate-fade-in">
<div class="section-header">
<h2>${headerTitle}</h2>
<p class="section-desc">${headerDesc}</p>
</div>
<div class="roadmap-grid">
${phasesHtml}</div>
</section>`;
  }

  if (sectionId === 'seminar') {
    const headerTitle = renderMarkdownInline(data.header.title);
    const headerDesc = renderMarkdownInline(data.header.desc);

    let itemsHtml = '';
    (data.items || []).forEach(item => {
      itemsHtml += `<div class="timeline-item">
<div class="timeline-date">${item.week}</div>
<div class="timeline-content">
<h3 class="timeline-title">${item.title}</h3>
<p>${renderMarkdownInline(item.desc)}</p>
<span class="presenter">${item.presenter}</span>
</div>
</div>\n`;
    });

    return `<section id="seminar" class="seminar-view animate-fade-in">
<div class="section-header">
<h2>${headerTitle}</h2>
<p class="section-desc">${headerDesc}</p>
</div>
<div class="timeline">
${itemsHtml}</div>
</section>`;
  }

  if (sectionId === 'ctf') {
    const headerTitle = renderMarkdownInline(data.header.title);
    const headerDesc = renderMarkdownInline(data.header.desc);

    let ranksHtml = '';
    (data.leaderboard || []).forEach((r, idx) => {
      ranksHtml += `<tr class="rank-${idx + 1}">
<td>${r.rank}</td>
<td class="user-cell">${r.user}</td>
<td class="pts-cell">${r.score}</td>
<td class="status-cell">${r.status}</td>
</tr>\n`;
    });

    let chalsHtml = '';
    (data.challenges || []).forEach(c => {
      const isSolved = c.status.toLowerCase() === 'solved';
      const cardClass = isSolved ? 'challenge-card solved' : 'challenge-card';
      const badgeClass = `status-badge ${isSolved ? 'solved' : 'open'}`;
      const badgeText = isSolved ? 'COMPLETED' : 'ACTIVE';
      const categoryClass = `chal-category ${c.category.toLowerCase()}`;

      chalsHtml += `<div class="${cardClass}">
<span class="${categoryClass}">${c.category}</span>
<div class="chal-details">
<h4>${c.title}</h4>
<p class="chal-pts">${c.score}</p>
</div>
<span class="${badgeClass}">${badgeText}</span>
</div>\n`;
    });

    return `<section id="ctf" class="ctf-view animate-fade-in">
<div class="section-header">
<h2>${headerTitle}</h2>
<p class="section-desc">${headerDesc}</p>
</div>
<div class="ctf-container">
<!-- Scoreboard Panel -->
<div class="scoreboard-section">
<h3 class="panel-title">Leaderboard</h3>
<table class="ctf-table">
<thead>
<tr>
<th>RANK</th>
<th>USER</th>
<th>SCORE</th>
<th>STATUS</th>
</tr>
</thead>
<tbody>
${ranksHtml}</tbody>
</table>
</div>
<!-- Challenges Panel -->
<div class="challenges-section">
<h3 class="panel-title">Active Challenges</h3>
<div class="challenge-list">
${chalsHtml}</div>
</div>
</div>
</section>`;
  }

  return '';
}

module.exports = { compileJsonToHtml };
