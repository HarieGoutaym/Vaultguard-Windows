if (!window.vaultAPI) {
  console.log("Mocking window.vaultAPI for browser preview...");
  
  const listeners = {};
  
  window.vaultAPI = {
    vault: { 
      checkExists: async () => true,
      unlock: async () => ({success: true}),
      setup: async () => ({success: true}),
      lock: async () => ({success: true})
    },
    window: { minimize: ()=>{}, maximize: ()=>{}, close: ()=>{} },
    onAutoLocked: (cb) => { listeners['autolock'] = cb; },
    entries: {
      getAll: async () => [
        { id: '1', title: 'GitHub', username: 'dev@company.com', type: 'login', tags: ['work', 'dev'] },
        { id: '2', title: 'AWS Production', username: 'admin', type: 'login', tags: ['work', 'infra'] }
      ],
      search: async () => [],
      get: async (id) => ({ id, title: 'Mock', username: 'mock', password: 'mockpassword' })
    },
    categories: { 
      get: async () => [{id:'1', name:'Work', icon:'💼'}, {id:'2', name:'Personal', icon:'🏠'}]
    },
    cloud: {
      status: async () => ({ connected: false })
    },
    settings: {
      get: async () => ({ theme: 'dark' })
    },
    security: {
      runAudit: async () => ({ breached: 2, weak: 5, reused: 1 }),
      checkBreach: async () => ({ pwned: false })
    },
    passwords: {
      generate: async () => ({ success: true, password: "mockGeneratedPassword123!", strength: "strong" })
    },
    totp: {
      generate: async () => ({ success: true, uri: "mockTotpUri" })
    },
    on: (event, cb) => {
      listeners[event] = cb;
    }
  };
}
