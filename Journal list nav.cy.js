// cypress/e2e/je_list_view.cy.js
const BASE      = Cypress.env('base') || 'http://172.164.240.105';
const EMAIL     = Cypress.env('email') || 'asjhq@asj.com';
const PASSWORD  = Cypress.env('password') || 'password';
const TENANT_ID = String(Cypress.env('tenantId') || '1');

// Swallow noisy Livewire/redirect errors so nav checks don’t flake
Cypress.on('uncaught:exception', (err) => {
  const m = err?.message || '';
  if (
    /Unexpected token '<'|is not valid JSON/i.test(m) ||
    /Snapshot missing on Livewire component/i.test(m) ||
    /Component already initialized/i.test(m) ||
    /Cannot read properties of undefined \(reading 'uri'\)/i.test(m) ||
    /ReferenceError:\s*option is not defined/i.test(m)
  ) return false;
});

describe('Journal Entries – list view renders', () => {
  it('navigates and shows the JE list table headers', () => {
    // 1) Login
    cy.visit(`${BASE}/login`);
    cy.get('input[type="email"], input#email, input[name*=email i]')
      .filter(':visible').first().clear().type(EMAIL);
    cy.get('input[type="password"], input#password, input[name*=password i]')
      .filter(':visible').first().clear().type(PASSWORD, { log: false });
    cy.contains('button,a,[role="button"]', /login|sign in|submit|continue/i).click({ force: true });

    // 2) Handle tenant picker quickly; if present, click something or force dashboard with tenant
    cy.location('pathname', { timeout: 20000 }).then((p) => {
      if (p.includes('/select-tenant')) {
        cy.get('button,li,a,[role="option"]', { timeout: 10000 })
          .filter(':visible')
          .first()
          .click({ force: true });
      }
    });
    cy.location('pathname', { timeout: 5000 }).then((p) => {
      if (!/\/dashboard($|\?)/.test(p)) {
        cy.visit(`${BASE}/dashboard?tenant=${TENANT_ID}`, { failOnStatusCode: false });
      }
    });

    // 3) Go straight to Journal Entries list (keep tenant in querystring)
    cy.visit(`${BASE}/journal-entries?tenant=${TENANT_ID}`, { failOnStatusCode: false });

    // 4) Occasionally app detours to /accounting; if so, visit JE again
    cy.location('pathname', { timeout: 20000 }).then((p) => {
      if (!p.startsWith('/journal-entries')) {
        cy.visit(`${BASE}/journal-entries?tenant=${TENANT_ID}`, { failOnStatusCode: false });
      }
    });

    // 5) Assert the list view is rendered:
    //    - Optional: breadcrumb bits
    cy.contains(/Accounting/i).should('exist');
    cy.contains(/Journal Entries/i).should('exist');

    //    - The search box from your screenshot
    cy.get('input[placeholder*="Search"][placeholder*="journal" i]').should('be.visible');

    //    - The "+ Add Journal Entry" button (view-only check; we don’t click it)
    cy.contains('button,a,[role="button"]', /\+\s*Add\s+Journal\s+Entry/i).should('be.visible');

    //    - The table with expected headers
    const headers = [
      'Trans Date',
      'Transaction Type',
      'Trans No',
      'Reference',
      'Narrative',
      'Currency Value',
      'Metal Value',
      'Status',
    ];
    cy.get('table:visible', { timeout: 20000 })
      .first()
      .within(() => {
        headers.forEach((h) => {
          cy.contains('th,td', new RegExp(`^\\s*${h}\\s*$`, 'i')).should('exist');
        });
      });

    //    - And there should be a tbody (rows may be 0+, we just verify table body exists)
    cy.get('table:visible tbody').should('exist');
  });
});
