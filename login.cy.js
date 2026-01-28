// Ignore noisy Livewire errors so tests don't false-fail
Cypress.on('uncaught:exception', (err) => {
  if (
    err.message?.includes('Component already registered') ||
    err.message?.includes('Component already initialized') ||
    err.message?.includes('Livewire')
  ) return false;
  return true;
});

const BASE = 'http://172.164.240.105'; // change if needed

// Common login helper
const doLogin = (email, password) => {
  cy.visit(`${BASE}/login`);

  // Email + Password
  cy.get('input[placeholder="Type your email"]', { timeout: 10000 })
    .should('be.visible')
    .clear()
    .type(email);

  cy.get('input[placeholder="Type your password"]', { timeout: 10000 })
    .should('be.visible')
    .clear()
    .type(password);

  cy.contains('Log in', { matchCase: false }).should('be.enabled').click();

  // Expect redirect to dashboard
  cy.url({ timeout: 15000 }).should('include', '/dashboard');

  // Smoke check dashboard loaded (use generic checks to avoid flakiness)
  cy.get('body').should('not.contain', 'These credentials do not match');
  cy.get('nav, header, [data-testid="dashboard"], [role="navigation"]').should('exist');
};

describe('GemNex ERP Login Verification', () => {
  it('logs in as Admin role (system user)', () => {
    doLogin('admin@gmail.com', 'admin123');
  });

  it('logs in as ASJ tenant user', () => {
    doLogin('asjhq@asj.com', 'password');
  });
});
