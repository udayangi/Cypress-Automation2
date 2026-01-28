/// <reference types="cypress" />

// ================== ENV CONFIG ==================
const BASE = Cypress.env("base") || "http://172.164.240.105";
const EMAIL = Cypress.env("email") || "asjhq@asj.com";
const PASSWORD = Cypress.env("password") || "password";
const TENANT_ID = String(Cypress.env("tenantId") || "1");
const TENANT_NAME = Cypress.env("tenantName") || "ASJ Qatar";

// ================== HELPERS ==================
function waitForLivewireIdle() {
  cy.get("[wire\\:loading]:visible", { timeout: 15000 }).should("not.exist");
  cy.wait(300);
}

function loginAndBindTenant() {
  cy.visit(`${BASE}/login`);

  cy.get("input[type=email], #email").first().clear().type(EMAIL);
  cy.get("input[type=password], #password").first().clear().type(PASSWORD, { log: false });

  cy.contains("button, a, [role=button]", /log\s*in/i)
    .should("be.visible")
    .click({ force: true });

  cy.location("pathname", { timeout: 20000 }).should((p) => {
    expect(p.includes("/select-tenant") || /\/dashboard($|\?)/.test(p)).to.eq(true);
  });

  cy.location("pathname").then(($p) => {
    if ($p.includes("/select-tenant")) {
      cy.contains(":visible", TENANT_NAME, { timeout: 15000 }).click();
    }
  });

  cy.url({ timeout: 20000 }).should("match", /\/dashboard(\?|$)/);
}

function openPurchaseModule() {
  cy.visit(`${BASE}/purchasing?tenant=${TENANT_ID}`, { failOnStatusCode: false });
  cy.location("pathname", { timeout: 20000 }).should("include", "/purchasing");
  cy.contains(/Purchase Request/i, { timeout: 10000 }).should("be.visible");
}

function clickNewPurchaseRequest() {
  cy.contains("button, a", /\+ New Purchasing Request/i, { timeout: 10000 })
    .should("be.visible")
    .click({ force: true });

  waitForLivewireIdle();
  cy.contains("label,span,div", /^Supplier$/i, { timeout: 10000 }).should("be.visible");
}

function selectSupplier() {
  cy.contains("label,span,div", /^Supplier$/i)
    .parent()
    .find("select")
    .first()
    .should("be.visible")
    .select("ALWAAD", { force: true });
  waitForLivewireIdle();
}

function setDates(requested, expected) {
  cy.get("input[type=date]").eq(0).clear().type(requested);
  cy.get("input[type=date]").eq(1).clear().type(expected);
}

function addProductAndVerifyInGrid() {
  // Category
  cy.contains("label,span,div", /^Category$/i)
    .parent()
    .find("select")
    .first()
    .select("Gold", { force: true });

  // Sub Category
  cy.contains("label,span,div", /^Sub Category$/i)
    .parent()
    .find("select")
    .first()
    .select("Jewellery", { force: true });

  // Product Name
  cy.get("input[placeholder*='Search products']")
    .should("be.visible")
    .type("GOLD ANKLET", { delay: 50 });

  // Find the dropdown item by its text content and click
  cy.contains("li", "GOLD ANKLET", { timeout: 10000 })
    .should("be.visible")
    .click({ force: true });

  // Attribute Group (free-text field)
  cy.get("input[placeholder*='Search attribute']")
    .should("be.visible")
    .clear()
    .type("10K", { delay: 50 });

  // ✅ FIX: Find the '10K' list item and click it
  cy.contains("li", "10K", { timeout: 10000 })
    .should("be.visible")
    .click({ force: true });

  // Value Type → Fixed Value
  cy.contains("label,span,div", /^Fixed Value$/i)
    .prev("input[type=radio]")
    .check({ force: true });

  // Unit of Measure
  cy.contains("label,span,div", /^Unit of Measure$/i)
    .parent()
    .find("select")
    .first()
    .select("Gram", { force: true });

  // Value per Unit
  cy.contains("label,span,div", /Value per Unit/i)
    .parent()
    .find("input")
    .first()
    .clear()
    .type("10");

  // Quantity
  cy.contains("label,span,div", /^Quantity$/i)
    .parent()
    .find("input")
    .first()
    .clear()
    .type("100");

  // Add to Product List
  cy.contains("button", /Add to Product List/i)
    .should("be.visible")
    .click({ force: true });

  waitForLivewireIdle();

  // ✅ Verify row in grid
  cy.get("table").should("be.visible").within(() => {
    cy.contains("td", "GOLD ANKLET").should("be.visible");
    cy.contains("td", "10K").should("be.visible");
    cy.contains("td", "Gram").should("be.visible");
    cy.contains("td", "10").should("be.visible");
    cy.contains("td", "100").should("be.visible");
    cy.contains("td", "1000").should("be.visible"); // Total
  });
}

// ================== SPEC ==================
describe("Purchase Request - Internal Purchase Add", () => {
  it("creates and submits a Purchase Request with product in grid", () => {
    loginAndBindTenant();
    openPurchaseModule();
    clickNewPurchaseRequest();

    // Supplier + Dates
    selectSupplier();
    setDates("2025-09-17", "2025-09-25");

    // Product section
    addProductAndVerifyInGrid();

    // Submit
    cy.contains("button", /^Submit$/i)
      .scrollIntoView()
      .should("be.visible")
      .and("not.be.disabled")
      .click({ force: true });

    // Verify success
    cy.contains(/submitted successfully|Purchase Request created|success/i, {
      timeout: 20000,
    }).should("be.visible");
  });
});