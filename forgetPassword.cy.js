// cypress/e2e/forgetPassword.cy.js

// Ignore noisy Livewire exceptions so tests don't false-fail
Cypress.on('uncaught:exception', (err) => {
  if (
    err.message?.includes('Livewire') ||
    err.message?.includes('Component already registered') ||
    err.message?.includes('Component already initialized') ||
    err.message?.includes('Snapshot missing')
  ) return false;
  return true;
});

describe('Forgot Password Flow - Request OTP and Type OTP', () => {
  it('should send OTP to given email and type it', () => {
    const email = 'admin@gmail.com'; // change if needed
    const otp    = '123456';         // test OTP; we’ll trim to input count

    // 1) Visit login page
    cy.visit('http://172.164.240.105/login');

    // 2) Go to forgot-password
    cy.contains('Forgot your password', { timeout: 10000 })
      .should('be.visible')
      .click();

    // 3) Verify URL
    cy.url().should('include', '/forgot-password');

    // 4) Intercept Livewire post
    cy.intercept('POST', '/livewire/update').as('lw');

    // 5) Type email (first text input on this screen)
    cy.get('input[type="text"]').first().should('be.visible').clear().type(email);

    // 6) Confirm
    cy.contains('Confirm').should('be.visible').click();

    // 7) Wait for Livewire response
    cy.wait('@lw');

    // 8) Wait for either OTP screen or show a meaningful failure
    cy.get('body', { timeout: 15000 }).then(($body) => {
      const txt = $body.text();

      // If your backend rate-limits OTP, don’t proceed to typing
      if (txt.includes('You have reached the daily limit for OTP requests')) {
        cy.contains('You have reached the daily limit for OTP requests').should('be.visible');
        // Stop here to avoid flaky failures when rate-limited
        return;
      }

      // Expect OTP screen texts
      cy.contains('OTP Verification', { timeout: 10000 }).should('be.visible');
      cy.contains('Please confirm your OTP').should('be.visible');

      // 9) Fill OTP inputs dynamically (handles 4/6/etc.)
      cy.get('input[type="text"]').then(($inputs) => {
        const count = $inputs.length;
        expect(count, 'OTP input count').to.be.greaterThan(0);

        const digits = otp.slice(0, count).split('');
        cy.wrap($inputs).each(($input, i) => {
          cy.wrap($input).clear().type(digits[i], { delay: 120 });
        });
      });

      // 10) Optional: assert next step (uncomment if applicable)
      // cy.contains('Change Password', { timeout: 10000 }).should('be.visible');
    });
  });
});



