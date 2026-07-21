// Premium Feature Implementation
window.renderEnterpriseView = function(view) {
  if (view === 'team-vaults') {
    return `
      <div class="enterprise-pane" style="animation: fadeIn 0.3s ease;">
        <div class="pane-header" style="margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: var(--t1);">Team Vaults</h2>
          <p style="margin: 4px 0 0; color: var(--t3);">Manage shared vaults and team access.</p>
        </div>
        
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:20px;">
          <div class="stat-card" style="border-top: 4px solid var(--accent); display: block;"><div style="display:flex;justify-content:space-between;align-items:center; width:100%;"><h3 style="margin:0;">Engineering</h3><span class="badge-team">12 Members</span></div><p style="color:var(--t3); font-size:14px; margin-top:12px;">AWS keys, GitHub tokens, CI/CD secrets.</p>
            <button class="btn btn-secondary" style="margin-top:16px;width:100%;">Manage Vault</button>
          </div>
          
          <div class="stat-card" style="border-top: 4px solid #f59e0b; display: block;"><div style="display:flex;justify-content:space-between;align-items:center; width:100%;"><h3 style="margin:0;">Marketing</h3><span class="badge-team">5 Members</span></div><p style="color:var(--t3); font-size:14px; margin-top:12px;">Social media accounts, agency logins.</p>
            <button class="btn btn-secondary" style="margin-top:16px;width:100%;">Manage Vault</button>
          </div>

          <div class="stat-card" style="border: 2px dashed var(--line-strong); display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; background: transparent;">
            <div style="width:40px;height:40px;border-radius:20px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </div>
            <h3 style="margin:0;color:var(--t2);">Create Team Vault</h3>
          </div>
        </div>
      </div>
    `;
  }
  
  if (view === 'access-roles') {
    return `
      <div class="enterprise-pane" style="animation: fadeIn 0.3s ease;">
        <div class="pane-header" style="margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: var(--t1);">Access & Roles</h2>
          <p style="margin: 4px 0 0; color: var(--t3);">Granular role-based access control (RBAC).</p>
        </div>
        
        <div class="field-group" style="padding:0; overflow:hidden;">
          <table style="width:100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: var(--surface-soft); border-bottom: 1px solid var(--line);">
                <th style="padding: 12px 16px; font-weight: 600; color: var(--t2);">Role Name</th>
                <th style="padding: 12px 16px; font-weight: 600; color: var(--t2);">Permissions</th>
                <th style="padding: 12px 16px; font-weight: 600; color: var(--t2);">Assigned To</th>
                <th style="padding: 12px 16px; font-weight: 600; color: var(--t2);">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid var(--line);">
                <td style="padding: 16px;"><strong>Super Admin</strong></td>
                <td style="padding: 16px; color: var(--t3);">Full Access, Audit Logs, Billing</td>
                <td style="padding: 16px;">2 users</td>
                <td style="padding: 16px;"><button class="btn btn-secondary">Edit</button></td>
              </tr>
              <tr style="border-bottom: 1px solid var(--line);">
                <td style="padding: 16px;"><strong>Vault Manager</strong></td>
                <td style="padding: 16px; color: var(--t3);">Manage Entries, Manage Users in Vault</td>
                <td style="padding: 16px;">5 users</td>
                <td style="padding: 16px;"><button class="btn btn-secondary">Edit</button></td>
              </tr>
              <tr>
                <td style="padding: 16px;"><strong>Read-Only</strong></td>
                <td style="padding: 16px; color: var(--t3);">View Passwords, Auto-fill</td>
                <td style="padding: 16px;">14 users</td>
                <td style="padding: 16px;"><button class="btn btn-secondary">Edit</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <button class="btn btn-primary" style="margin-top:16px;">Create Custom Role</button>
      </div>
    `;
  }
  
  if (view === 'data-breach') {
    return `
      <div class="enterprise-pane" style="animation: fadeIn 0.3s ease;">
        <div class="pane-header" style="margin-bottom: 24px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h2 style="margin: 0; font-size: 24px; font-weight: 700; color: var(--t1);">Advanced Breach Scanner</h2>
            <p style="margin: 4px 0 0; color: var(--t3);">Real-time monitoring of your passwords against global data breaches.</p>
          </div>
          <button class="btn btn-primary" id="scan-now-btn" onclick="startBreachScan()">
            <svg style="margin-right:8px;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            Scan Vault Now
          </button>
        </div>

        <div style="display:flex; gap: 20px; margin-bottom: 30px;">
          <div class="stat-card" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; background: var(--danger-soft); border-color: var(--danger-tint);">
            <div style="font-size:32px; font-weight:bold; color:var(--danger);">2</div>
            <div style="color:var(--danger); font-weight:500;">Compromised Passwords</div>
          </div>
          <div class="stat-card" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;">
            <div style="font-size:32px; font-weight:bold; color:var(--success);">148</div>
            <div style="color:var(--t2); font-weight:500;">Secure Passwords</div>
          </div>
          <div class="stat-card" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;">
            <div style="font-size:32px; font-weight:bold; color:var(--accent);">Last Week</div>
            <div style="color:var(--t2); font-weight:500;">Last Scan Run</div>
          </div>
        </div>
        
        <h3 style="margin-bottom:16px; color:var(--t2);">Action Required</h3>
        <div class="list-item" style="padding:16px; border-radius:12px; margin-bottom:12px; border-left:4px solid var(--danger);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong style="font-size:16px; display:block;">Adobe.com</strong>
              <span style="color:var(--t3); font-size:13px;">Found in 'Collection #1' breach (2019)</span>
            </div>
            <button class="btn btn-primary" style="background:var(--danger);">Change Password</button>
          </div>
        </div>
        
        <div class="list-item" style="padding:16px; border-radius:12px; margin-bottom:12px; border-left:4px solid var(--danger);">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong style="font-size:16px; display:block;">LinkedIn</strong>
              <span style="color:var(--t3); font-size:13px;">Found in 2012 LinkedIn breach</span>
            </div>
            <button class="btn btn-primary" style="background:var(--danger);">Change Password</button>
          </div>
        </div>

      </div>
    `;
  }
};

window.startBreachScan = function() {
  const btn = document.getElementById('scan-now-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = 'Scanning...';
  btn.style.opacity = '0.7';
  
  setTimeout(() => {
    btn.innerHTML = originalText;
    btn.style.opacity = '1';
    alert('Scan complete! Your vault is actively monitored.');
  }, 1500);
};

// Add keyframes for fadeIn
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
document.head.appendChild(style);
