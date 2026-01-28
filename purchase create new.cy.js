/// <reference types="cypress" />

// ================== ENV CONFIG ==================
const BASE        = Cypress.env("base")       || "http://172.164.240.105";
const EMAIL       = Cypress.env("email")      || "asjhq@asj.com";
const PASSWORD    = Cypress.env("password")   || "password";
const TENANT_ID   = String(Cypress.env("tenantId")   || "1");
const TENANT_NAME = Cypress.env("tenantName") || "ASJ Qatar";

// ================== NETWORK / LIVEWIRE HELPERS ==================

/**
 * Intercept all Livewire POST calls (update/message variants)
 * and alias them as @lw.
 */
function interceptLivewire() {
  cy.intercept("POST", "**/livewire/**").as("lw");
}

/**
 * Wait for N Livewire POSTs and tolerate both 2xx and 3xx
 * since Livewire occasionally redirects during navigation/refresh flows.
 * Also guards against missing response objects.
 */
function waitLivewire(n = 1) {
  for (let i = 0; i < n; i++) {
    cy.wait("@lw", { timeout: 30000 }).then((interception) => {
      const code = interception?.response?.statusCode ?? 0;
      expect([200, 201, 202, 204, 206, 301, 302, 303, 307, 308]).to.include(code);
    });
  }
  cy.get("[wire\\:loading]:visible", { timeout: 20000 }).should("not.exist");
  cy.wait(150); // let the DOM settle post-render
}

// ================== FLOW HELPERS ==================

function loginAndBindTenant() {
  cy.visit(`${BASE}/login`, { failOnStatusCode: false });

  cy.get("input[type=email], #email").first().clear().type(EMAIL);
  cy.get("input[type=password], #password").first().clear().type(PASSWORD, { log: false });

  cy.contains("button, a, [role=button]", /log\s*in/i)
    .should("be.visible")
    .click();

  // Either tenant selection or direct dashboard
  cy.location("pathname", { timeout: 20000 }).should((p) => {
    expect(p.includes("/select-tenant") || /\/dashboard($|\?)/.test(p)).to.eq(true);
  });

  cy.location("pathname").then((p) => {
    if (p.includes("/select-tenant")) {
      cy.contains(":visible", TENANT_NAME, { timeout: 15000 })
        .scrollIntoView()
        .click();
    }
  });

  cy.url({ timeout: 20000 }).should("match", /\/dashboard(\?|$)/);
}

function openPurchaseModule() {
  cy.visit(`${BASE}/purchasing?tenant=${TENANT_ID}`, { failOnStatusCode: false });
  cy.location("pathname", { timeout: 20000 }).should("include", "/purchasing");
  cy.contains(/Purchase Request/i, { timeout: 15000 }).should("be.visible");
}

function clickNewPurchaseRequest() {
  cy.contains("button, a", /\+ New Purchasing Request/i, { timeout: 15000 })
    .should("be.visible")
    .click();

  // Livewire round-trip after opening the create form
  waitLivewire(1);

  // Ensure the PR form is visible
  cy.contains("label,span,div", /^Supplier$/i, { timeout: 15000 }).should("be.visible");
}

function selectSupplier() {
  cy.contains("label,span,div", /^Supplier$/i)
    .parent()
    .find("select")
    .first()
    .should("be.visible")
    .select("ALWAAD");
  waitLivewire(1);
}

function setDates(requestedISO, expectedISO) {
  cy.get("input[type=date]").eq(0).clear().type(requestedISO);
  cy.get("input[type=date]").eq(1).clear().type(expectedISO);
}

/**
 * Robustly set Value Type to "Fixed":
 * - If a label "Fixed Value" exists with a radio, check it
 * - Else, try a "Value Type" select and choose "Fixed"
 * - Else, check first radio inside Value Type container (commonly Fixed)
 */
function chooseValueTypeFixed() {
  cy.get("body").then(($body) => {
    const hasFixedLabel =
      $body.find("label,span,div").toArray().some((el) => /fixed value/i.test(el.textContent || ""));

    if (hasFixedLabel) {
      cy.contains("label,span,div", /^Fixed Value$/i, { timeout: 10000 })
        .prev("input[type=radio]")
        .check({ force: true });
      waitLivewire(1);
      return;
    }

    cy.contains("label,span,div", /^Value Type$/i, { timeout: 10000 })
      .parent()
      .within(() => {
        cy.get("input[type=radio], select").then(($els) => {
          const $sel = $els.filter("select");
          if ($sel.length) {
            cy.wrap($sel.first()).select(/fixed/i, { force: true });
          } else {
            cy.get("input[type=radio]").first().check({ force: true });
          }
        });
      });
    waitLivewire(1);
  });
}

function addProductAndVerifyInGrid() {
  // Category
  cy.contains("label,span,div", /^Category$/i)
    .parent()
    .find("select")
    .first()
    .select("Gold");
  waitLivewire(1);

  // Sub Category
  cy.contains("label,span,div", /^Sub Category$/i)
    .parent()
    .find("select")
    .first()
    .select("Jewellery");
  waitLivewire(1);

  // Product Name (typeahead)
  cy.get("input[placeholder*='Search products']")
    .should("be.visible")
    .clear()
    .type("GOLD ANKLET", { delay: 30 });

  cy.contains("li", "GOLD ANKLET", { timeout: 15000 })
    .should("be.visible")
    .click();
  waitLivewire(1);

  // Attribute Group search
  cy.get("input[placeholder*='Search attribute']")
    .should("be.visible")
    .clear()
    .type("10K", { delay: 30 });

  cy.contains("li", "10K", { timeout: 15000 })
    .should("be.visible")
    .click();
  waitLivewire(1);

  // Value Type → Fixed
  chooseValueTypeFixed();

  // Unit of Measure
  cy.contains("label,span,div", /^Unit of Measure$/i)
    .parent()
    .find("select")
    .first()
    .select("Gram");
  waitLivewire(1);

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
    .click();
  waitLivewire(2); // adding a row often triggers more than one update

  // Verify row in grid
  cy.get("table", { timeout: 15000 }).should("be.visible").within(() => {
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
  beforeEach(() => {
    interceptLivewire();
  });

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
    cy.contains("button", /^Submit$/i, { timeout: 15000 })
      .scrollIntoView()
      .should("be.enabled")
      .click();

    waitLivewire(1);

    // Verify success (toast / flash)
    cy.contains(/submitted successfully|purchase request created|success/i, {
      timeout: 20000,
    }).should("be.visible");
  });
});
