const { marked } = require('marked');

// Disable bold and italic markdown parsing by overriding strong and em renderers to return the original markup text
marked.use({
  renderer: {
    strong(text) {
      return `**${text}**`;
    },
    em(text) {
      return `*${text}*`;
    }
  }
});

// Helper to render inline markdown safely inside JSON fields
function renderMarkdownInline(text) {
  if (!text) return '';
  return marked.parseInline(text);
}

function compileJsonToHtml(sectionId, blocks) {
  // Support legacy format gracefully by converting it to blocks in-memory
  if (!Array.isArray(blocks)) {
    const data = blocks;
    const legacyBlocks = [];
    if (sectionId === 'home') {
      if (data.banner) legacyBlocks.push({ type: 'banner', ...data.banner });
      if (data.features) legacyBlocks.push({ type: 'features', items: data.features });
      if (data.links) {
        legacyBlocks.push({ type: 'spacer', height: '1.75rem' });
        legacyBlocks.push({ type: 'features', items: data.links });
      }
    } else if (sectionId === 'curriculum') {
      if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
      if (data.phases) legacyBlocks.push({ type: 'phases', items: data.phases });
    } else if (sectionId === 'seminar') {
      if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
      if (data.items) legacyBlocks.push({ type: 'timeline', items: data.items });
    } else if (sectionId === 'ctf') {
      if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
      if (data.leaderboard || data.challenges) {
        legacyBlocks.push({
          type: 'ctf_dashboard',
          leaderboard: data.leaderboard || [],
          challenges: data.challenges || []
        });
      }
    }
    blocks = legacyBlocks;
  }

  let htmlResult = '';
  // Determine outer section wrapper classes and ID
  if (sectionId === 'home') {
    htmlResult += '<section class="page-home animate-fade-in">\n';
  } else if (sectionId === 'curriculum') {
    htmlResult += '<section id="curriculum" class="curriculum-view animate-fade-in">\n';
  } else if (sectionId === 'seminar') {
    htmlResult += '<section id="seminar" class="seminar-view animate-fade-in">\n';
  } else if (sectionId === 'ctf') {
    htmlResult += '<section id="ctf" class="ctf-view animate-fade-in">\n';
  } else {
    htmlResult += `<section id="${sectionId}" class="animate-fade-in">\n`;
  }

  blocks.forEach(block => {
    try {
      if (block.type === 'banner') {
        const title = renderMarkdownInline(block.title);
        const lead = renderMarkdownInline(block.lead);
        const desc = renderMarkdownInline(block.desc);
        htmlResult += `<div class="terminal-banner">
<h2 class="hero-title">${title}</h2>
<p class="lead-text">${lead}</p>
<p class="hero-desc">${desc}</p>
</div>\n`;
      } 
      else if (block.type === 'header') {
        const title = renderMarkdownInline(block.title);
        const desc = renderMarkdownInline(block.desc);
        htmlResult += `<div class="section-header">
<h2>${title}</h2>
<p class="section-desc">${desc}</p>
</div>\n`;
      } 
      else if (block.type === 'spacer') {
        const height = block.height || '1.5rem';
        htmlResult += `<div style="height: ${height};"></div>\n`;
      }
      else if (block.type === 'features') {
        let featuresHtml = '';
        (block.items || []).forEach(f => {
          if (f.url) {
            featuresHtml += `<a href="${f.url}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
<div class="feat-card" style="height: 100%; border: 1px solid rgba(59, 130, 246, 0.15);">
<div class="feat-card-header">
<span class="feat-card-id">${f.tag}</span>
<h4 style="color: var(--color-cyan);">${f.title}</h4>
</div>
<p>${renderMarkdownInline(f.desc)}</p>
</div>
</a>\n`;
          } else {
            featuresHtml += `<div class="feat-card">
<div class="feat-card-header">
<span class="feat-card-id">${f.tag}</span>
<h4>${f.title}</h4>
</div>
<p>${renderMarkdownInline(f.desc)}</p>
</div>\n`;
          }
        });
        htmlResult += `<div class="features-grid">
${featuresHtml}</div>\n`;
      } 
      else if (block.type === 'phases') {
        let phasesHtml = '';
        (block.items || []).forEach(p => {
          let topicsHtml = '';
          (p.topics || []).forEach(t => {
            topicsHtml += `<li>${renderMarkdownInline(t)}</li>\n`;
          });
          phasesHtml += `<div class="roadmap-card">
<div class="card-badge">${p.phase}</div>
<h3 class="card-title">${p.title}</h3>
<p class="card-desc">${renderMarkdownInline(p.desc)}</p>
<ul class="card-topics">
${topicsHtml}</ul>
</div>\n`;
        });
        htmlResult += `<div class="roadmap-grid">
${phasesHtml}</div>\n`;
      } 
      else if (block.type === 'timeline') {
        let itemsHtml = '';
        (block.items || []).forEach(item => {
          itemsHtml += `<div class="timeline-item">
<div class="timeline-date">${item.week}</div>
<div class="timeline-content">
<h3 class="timeline-title">${item.title}</h3>
<p>${renderMarkdownInline(item.desc)}</p>
<span class="presenter">${item.presenter}</span>
</div>
</div>\n`;
        });
        htmlResult += `<div class="timeline">
${itemsHtml}</div>\n`;
      } 
      else if (block.type === 'ctf_dashboard') {
        let ranksHtml = '';
        (block.leaderboard || []).forEach((r, idx) => {
          ranksHtml += `<tr class="rank-${idx + 1}">
<td>${r.rank}</td>
<td class="user-cell">${r.user}</td>
<td class="pts-cell">${r.score}</td>
<td class="status-cell">${r.status}</td>
</tr>\n`;
        });

        let chalsHtml = '';
        (block.challenges || []).forEach(c => {
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

        htmlResult += `<div class="ctf-container">
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
</div>\n`;
      }
      else if (block.type === 'menu_item') {
        const submenus = block.submenus || [];
        let submenusHtml = submenus.map(sub => `<li>${sub.title} (${sub.url})</li>`).join('');
        htmlResult += `<div class="menu-item-preview"><strong>${block.title}</strong> (${block.url || 'No URL'})`;
        if (submenus.length > 0) {
          htmlResult += `<ul>${submenusHtml}</ul>`;
        }
        htmlResult += `</div>\n`;
      }
    } catch (e) {
      console.error('[Block Render Error] Failed rendering block:', e);
    }
  });

  htmlResult += '</section>';
  return htmlResult;
}

module.exports = { compileJsonToHtml };
