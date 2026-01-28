describe('ERP Dashboard Test - Navigate to Login', () => {
  // Ignore frontend JS/Livewire errors globally for this suite
  beforeEach(() => {
    Cypress.on('uncaught:exception', () => false);
  });

  it('should load login page after clicking Get started', () => {
    // Visit the dashboard
    cy.visit('http://172.164.240.105');

    // Wait for and click "Get started"
    cy.contains('Get started', { timeout: 10000 })
      .should('be.visible')
      .click();

    // Verify redirect to login page
    cy.url().should('include', '/login');

    // Verify login form fields exist
    cy.get('input[placeholder="Type your email"]').should('exist');
    cy.get('input[placeholder="Type your password"]').should('exist');
  });
});
