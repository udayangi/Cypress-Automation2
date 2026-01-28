// cypress/e2e/je_payable_qnb.cy.js
const BASE      = Cypress.env('base') || 'http://172.164.240.105';
const LOGIN_URL = `${BASE}/login`;

Cypress.on('uncaught:exception', (err) => {
  // ignore transient Livewire/redirect noise
  if (
    /Unexpected token '<'|is not valid JSON|Snapshot missing|Component already initialized|reading 'uri'/.test(err?.message || '')
  ) return false;
});

const loginTenant = () => {
  const TENANT_ID = String(Cypress.env('tenantId') || '1');

  cy.visit(LOGIN_URL);

  cy.get([
    'input[placeholder*="Type your email" i]',
    'input[type="email"]',
    '#email',
    'input[name*="email" i]',
  ].join(',')).filter(':visible').first()
    .clear().type(Cypress.env('email') || 'asjhq@asj.com', { delay: 10 });

  cy.get([
    'input[placeholder*="Type your password" i]',
    'input[type="password"]',
    '#password',
    'input[name*="password" i]',
  ].join(',')).filter(':visible').first()
    .clear().type(Cypress.env('password') || 'password', { log: false, delay: 10 });

  cy.contains('button,a,[role="button"]', /log\s*in|sign\s*in|submit|continue|login|signin/i, { timeout: 30000 })
    .click({ force: true });

  cy.location('pathname', { timeout: 30000 }).then((p) => {
    if (p.includes('/select-tenant')) {
      // try to click any tenant option; if none, force dashboard with QS
      cy.get('body').then(($b) => {
        const sel = [
          '[data-tenant-id]',
          'li[role="option"]',
          'button[role="option"]',
          'button,a,[role="button"]'
        ].find(s => $b.find(`${s}:visible`).length);
        if (sel) {
          cy.get(`${sel}:visible`).first().click({ force: true });
        } else {
          cy.visit(`${BASE}/dashboard?tenant=${TENANT_ID}`, { failOnStatusCode: false });
        }
      });
    }
  });

  cy.url({ timeout: 40000 }).should('include', '/dashboard');
};

const openJEForm = () => {
  // preserve ?tenant=...
  cy.location().then(({ search }) => {
    const qs = (search || '').trim();
    cy.visit(`${BASE}/journal-entries${qs || ''}`, { failOnStatusCode: false });
  });

  // open the create form with your data-cy hook
  cy.get('[data-cy="add-je-item"]', { timeout: 30000 }).should('be.visible').click({ force: true });

  // ensure the form is rendered
  cy.get('[data-cy="je-account"]', { timeout: 30000 }).should('be.visible');
  cy.get('[data-cy="je-amount"]').should('be.visible');
  cy.get('[data-cy="je-add-line"]').should('be.visible');
};

const addLine = (accountText, amount) => {
  cy.get('[data-cy="je-account"]').clear().type(accountText, { delay: 10 });

  // if your account field is an autocomplete, click the first option:
  cy.get('ul[role="listbox"] li:visible, [role="option"]:visible', { timeout: 10000 })
    .first().click({ force: true }).then(() => {
      // ok if no listbox exists; ignore failures
    });

  cy.get('[data-cy="je-amount"]').clear().type(String(amount), { delay: 10 });
  cy.get('[data-cy="je-add-line"]').click({ force: true });
};

const assertTotals = (debit, credit) => {
  const num = s => Number(String(s).replace(/[^\d.-]/g, '') || 0);

  cy.get('[data-cy="je-totals"]').within(() => {
    cy.get('[data-cy="debit-total"]').invoke('text').then(t => {
      expect(num(t)).to.eq(debit);
    });
    cy.get('[data-cy="credit-total"]').invoke('text').then(t => {
      expect(num(t)).to.eq(credit);
    });
  });
};

describe('JE – payable (DR 100) vs qnb (CR 100), QAR @ 1', () => {
  before(() => {
    loginTenant();
  });

  it('creates and validates two lines', () => {
    openJEForm();

    // Line 1: payable, amount 100
    addLine('payable', 100);

    // Line 2: qnb, amount 100
    addLine('qnb', 100);

    // Assert totals: Debit 100 / Credit 100
    assertTotals(100, 100);

    // OPTIONAL: if you expose Submit/Post hooks, uncomment:
    // cy.get('[data-cy="je-submit"]').click({ force: true });
    // cy.get('[data-cy="je-post"], [data-cy="je-approve"]').click({ force: true });
    // cy.contains(/Approved|Posted successfully|Journal posted|Status:\s*Approved/i, { timeout: 40000 }).should('exist');
  });
});
