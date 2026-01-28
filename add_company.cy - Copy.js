describe('Create Tenant (simple)', () => {
  const EMAIL = 'admin@example.com';
  const PASSWORD = 'password';

  before(() => {
    cy.loginLaravel(EMAIL, PASSWORD);
  });

  it('fills form and creates tenant', () => {
    cy.visit('/tenants');

    // ensure we’re actually on the page (not /login)
    cy.location('pathname', { timeout: 15000 }).should('eq', '/tenants');

    // use visible + first to avoid duplicate/hidden fields
    cy.get('form:visible').first().within(() => {
      cy.get('input[placeholder="Enter company name"]:visible').first().clear().type('Test Company');
      cy.get('input[placeholder="Enter short code"]:visible').first().clear().type('TC');
      cy.get('input[placeholder="Enter first name"]:visible').first().clear().type('John');
      cy.get('input[placeholder="Enter last name"]:visible').first().clear().type('Doe');
      cy.get('input[placeholder="Enter admin username"]:visible').first().clear().type('johndoe123');
      cy.get('input[placeholder="Enter admin email"]:visible').first().clear().type('johndoe@example.com');

      cy.contains('button:visible', 'Save').first().click();
    });

    // adjust to your real success signal
    cy.contains(/created successfully/i, { timeout: 15000 }).should('be.visible');
    // or:
    // cy.location('pathname', { timeout: 15000 }).should('match', /\/tenants(\/\d+)?$/);
  });
});
