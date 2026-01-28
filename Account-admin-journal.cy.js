// cypress/e2e/admin-no-journal.cy.js

// Optional: ignore noisy Livewire errors (keeps the run clean)
const IGNORE_RE =
  /Livewire|Component already (registered|initialized)|Snapshot missing|reading 'focus'|reading 'uri'|Cannot read properties of undefined|option is not defined/;
Cypress.on('uncaught:exception', (err) => (IGNORE_RE.test(err.message) ? false : true));

describe('RBAC Admin should not see Journal Entries', () => {
  const BASE = Cypress.env('base') || 'http://172.164.240.105';
  const LOGIN_URL = `${BASE}/login`;

  const ADMIN_EMAIL = Cypress.env('adminEmail') || 'admin@gmail.com';
  const ADMIN_PASS  = Cypress.env('adminPass')  || 'password';

  it('hides Journal Entries for Admin role', () => {
    cy.visit(LOGIN_URL);

    // email
    cy.get('input[type="email"], input#email')
      .filter(':visible')
      .first()
      .clear()
      .type(ADMIN_EMAIL);

    // password (you missed this before)
    cy.get('input[type="password"], input#password')
      .filter(':visible')
      .first()
      .clear()
      .type(ADMIN_PASS, { log: false });

    // login
    cy.contains(/log\s*in|sign\s*in/i).should('be.visible').click();

    // be generous with time; Livewire + redirects can be slow
    cy.url({ timeout: 30000 }).should('include', '/dashboard');

    // assert Journal Entries is not visible anywhere in the UI
    cy.contains(/Journal\s*Entries/i, { timeout: 2000 }).should('not.exist');
  });
});

