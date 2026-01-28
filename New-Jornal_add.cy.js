/// <reference types="cypress" />

/**
 * JE autofill:
 * - Login -> tenant
 * - Open /journal-entries -> Add Journal Item
 * - For each item: account -> location -> dept -> narrative -> currency -> rate -> debit/credit -> Add
 * - Assert the row appears in the grid
 * - Submit the JE
 *
 * Notes:
 * - No hard cy.wait('@lw…') — some selections don't POST; we wait on UI idle + grid changes instead.
 * - Amount API:
 * { amount: 1000, side: 'debit' }  // or 'credit'
 * { amount: -250 }                 // negative -> credit 250
 * { debit: 500 } / { credit: 500 } // explicit wins over amount/side
 */

// ================== ENV ==================
const BASE = Cypress.env("base") || "http://172.164.240.105";
const EMAIL = Cypress.env("email") || "asjhq@asj.com";
const PASSWORD = Cypress.env("password") || "password";
const TENANT_ID = String(Cypress.env("tenantId") || "1");
const TENANT_NAME = Cypress.env("tenantName") || "ASJ Qatar";

const JE_ITEMS_ENV = (() => {
  try {
    return JSON.parse(Cypress.env("jeItems") || "null");
  } catch {
    return null;
  }
})();

// ================== IGNORE NOISY FE ERRORS ==================
Cypress.on("uncaught:exception", (err) => {
  const m = err?.message || "";
  if (
    /Snapshot missing on Livewire component/i.test(m) ||
    /Component already initialized/i.test(m) ||
    /Component not found/i.test(m) ||
    /Cannot read properties of (null|undefined) \(reading '(?:hasAttribute|uri)'\)/i.test(m) ||
    /ReferenceError:\s*option is not defined/i.test(m)
  )
    return false;
});

// ================== GENERIC HELPERS ==================
function waitForLivewireIdle() {
  cy.get("[wire\\:loading]:visible", { timeout: 15000 }).should("not.exist");
  cy.wait(500); // Increased wait time for better stability
}

function typeClear($el, text) {
  cy.wrap($el)
    .should("be.visible")
    .click()
    .type("{selectall}{backspace}")
    .type(String(text));
}

const toRe = (v) =>
  v instanceof RegExp
    ? v
    : new RegExp(String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

function normalizeAmount(a) {
  if (a == null) return null;
  const n = Number(String(a).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function resolveAmounts({ amount, side, debit, credit }) {
  const d = normalizeAmount(debit),
    c = normalizeAmount(credit);
  if (d != null && d > 0) return { debit: String(d), credit: "0" };
  if (c != null && c > 0) return { debit: "0", credit: String(c) };
  const a = normalizeAmount(amount);
  if (a != null) {
    if (side) {
      const s = String(side).toLowerCase();
      if (s.startsWith("d")) return { debit: String(Math.abs(a)), credit: "0" };
      if (s.startsWith("c")) return { debit: "0", credit: String(Math.abs(a)) };
    }
    return a >= 0
      ? { debit: String(a), credit: "0" }
      : { debit: "0", credit: String(Math.abs(a)) };
  }
  return { debit: "0", credit: "0" };
}

// ================== LOGIN + TENANT ==================
function getEmailField() {
  return cy
    .get("form:visible")
    .first()
    .then(($f) => {
      const direct = $f
        .find('input[type="email"]:visible, #email:visible')
        .first();
      if (direct.length) return cy.wrap(direct);
      const fb = Array.from($f.find("input:visible")).find(
        (el) =>
          /email/i.test(el.name || "") ||
          /email/i.test(el.id || "") ||
          /email/i.test(el.placeholder || "")
      );
      return cy.wrap(fb || $f.find("input:visible").first());
    });
}

function getPasswordField() {
  return cy
    .get("form:visible")
    .first()
    .then(($f) => {
      const direct = $f
        .find('input[type="password"]:visible, #password:visible')
        .first();
      if (direct.length) return cy.wrap(direct);
      const fb = Array.from($f.find("input:visible")).find(
        (el) =>
          /pass(word)?/i.test(el.name || "") ||
          /pass(word)?/i.test(el.id || "") ||
          /pass(word)?/i.test(el.placeholder || "")
      );
      return cy.wrap(fb || $f.find("input:visible").eq(1));
    });
}

function clickLoginCTA() {
  cy.get("form:visible")
    .first()
    .then(($f) => {
      const sub = $f
        .find('button[type="submit"]:visible, input[type="submit"]:visible')
        .first();
      if (sub.length) return cy.wrap(sub).click({ force: true });
      cy.get('button:visible, a[role="button"]:visible, a:visible', {
        timeout: 10000,
      })
        .contains(/log\s*in|sign\s*in|continue|submit/i)
        .first()
        .click({ force: true });
    });
}

function loginAndBindTenant() {
  cy.visit(`${BASE}/login`);
  getEmailField().clear().type(EMAIL, { delay: 5 });
  getPasswordField().clear().type(PASSWORD, { log: false, delay: 5 });
  clickLoginCTA();
  cy.location("pathname", { timeout: 30000 }).should((p) =>
    expect(p.includes("/select-tenant") || /\/dashboard($|\?)/.test(p)).to.eq(
      true
    )
  );

  cy.location("pathname").then((p) => {
    if (p.includes("/select-tenant")) {
      cy.contains(":visible", new RegExp(`^\\s*${TENANT_NAME}\\s*$`, "i"), {
        timeout: 20000,
      }).then(($label) => {
        const clickTarget =
          $label.closest(
            'button,a,[role="button"],[tabindex],.cursor-pointer'
          )[0] || $label[0];
        cy.wrap(clickTarget).scrollIntoView().click({ force: true });
      });
      cy.location("pathname", { timeout: 6000 }).then((p2) => {
        if (p2.includes("/select-tenant")) {
          cy.visit(`${BASE}/dashboard?tenant=${TENANT_ID}`, {
            failOnStatusCode: false,
          });
        }
      });
    }
  });
  cy.url({ timeout: 30000 }).should("match", /\/dashboard(\?|$)/);
}

function openJEList() {
  cy.visit(`${BASE}/journal-entries?tenant=${TENANT_ID}`, {
    failOnStatusCode: false,
  });
  cy.location("pathname", { timeout: 20000 }).should(
    "include",
    "/journal-entries"
  );
}

// ================== OPEN JE DRAWER ==================
function openJEDrawer() {
  cy.contains('button,a,[role="button"]', /\+\s*Add\s+Journal\s+Entry/i, {
    timeout: 20000,
  })
    .scrollIntoView()
    .click({ force: true });
  cy.contains(":visible", /Add\s+Journal\s+Item/i, { timeout: 20000 }).should(
    "be.visible"
  );
  waitForLivewireIdle();
  cy.contains(":visible", /Add\s+Journal\s+Item/i)
    .closest("div")
    .parent()
    .as("jeRoot");
  cy.get("@jeRoot").within(() => {
    cy.contains(/Transaction Type/i).should("exist");
    cy.contains("button", /Add to Journal Items/i).should("exist");
  });
}

// ================== FIELD HELPERS ==================
function getSearchAccountInput() {
  return cy
    .get("@jeRoot")
    .find("input:visible")
    .filter((_, el) => {
      const ph = (el.getAttribute("placeholder") || "").toLowerCase();
      return ph.includes("search") && ph.includes("account");
    })
    .first();
}

function selectAccount(optionMatcher, typeHint = "101") {
  const rx = toRe(optionMatcher);
  getSearchAccountInput().as("acct");
  cy.get("@acct")
    .click()
    .type("{selectall}{backspace}")
    .type(String(typeHint), { delay: 5 });
  cy.get("body", { timeout: 10000 }).within(() => {
    cy.contains('li,div,[role="option"]', rx, { timeout: 10000 })
      .scrollIntoView()
      .click({ force: true });
  });
  waitForLivewireIdle();
}

function selectLocation(match) {
  const matcher = toRe(match);
  cy.get("@jeRoot").then(($root) => {
    const $cands = $root.find("select:visible");
    let sel = null;
    $cands.each((_, el) => {
      const opts = Array.from(el.options || []).map((o) =>
        (o.textContent || "").trim().toLowerCase()
      );
      const hint = `${el.id || ""} ${el.name || ""}`.toLowerCase();
      if (
        opts.join("|").includes("select location") ||
        opts.some((t) => /\bho\b|\basj gold\b|\basj dia\b/.test(t)) ||
        /location/.test(hint)
      ) {
        sel = el;
        return false;
      }
    });
    if (!sel) {
      cy.log("Location <select> not found; skipping");
      return;
    }
    const opt = Array.from(sel.options || []).find((o) =>
      matcher.test((o.textContent || "").trim())
    );
    if (!opt) {
      cy.log("Location option not found for", String(match));
      return;
    }
    cy.wrap(sel).select(opt.value, { force: true });
    waitForLivewireIdle();
  });
}

function findCtlByLabel(labelRe) {
  cy.get("@jeRoot").within(() => {
    cy.contains("label,div,span,th,td", labelRe, { timeout: 10000 })
      .first()
      .then(($label) => {
        const forId = $label.attr("for");
        if (forId) {
          cy.wrap(Cypress.$("#" + forId))
            .filter(":visible")
            .first()
            .as("ctl");
        } else {
          const $scope = $label.closest("div")[0] || $label.parent()[0];
          const $candidate = Cypress.$($scope)
            .find("input,textarea,select,button,[contenteditable]")
            .filter(":visible")
            .first();
          cy.wrap($candidate.length ? $candidate : $label).as("ctl");
        }
      });
  });
  return cy.get("@ctl");
}

function setDepartments(text) {
  findCtlByLabel(/^Departments?\b/i).then(($el) => typeClear($el, text));
}

function setNarrative(text) {
  findCtlByLabel(/^Narrative|Description\b/i).then(($el) =>
    typeClear($el, text)
  );
}

function setCurrency(match) {
  const matcher = toRe(match);
  cy.get("@jeRoot").within(() => {
    cy.contains("label,div,span,th,td", /^Currency$/i, { timeout: 10000 })
      .first()
      .then(($lbl) => {
        const forId = $lbl.attr("for");
        let targetElement = null;

        if (forId) {
          targetElement = Cypress.$("#" + forId)
            .filter(":visible")
            .first();
        }

        if (!targetElement || !targetElement.is("select")) {
          targetElement = $lbl
            .closest("div")
            .find('input, button, [role="combobox"], [role="listbox"]')
            .filter(":visible")
            .first();
        }

        if (targetElement && targetElement.length) {
          cy.wrap(targetElement).click({ force: true });
        } else {
          cy.log("Could not find a clickable currency element.");
          cy.wrap($lbl).click({ force: true });
        }
      });
  });
  cy.contains("body", matcher, { timeout: 10000 })
    .should("be.visible")
    .click({ force: true });
  waitForLivewireIdle();
}

function setExchangeRate(val) {
  findCtlByLabel(/^Exchange\s*Rate/i).then(($el) => {
    const isReadOnly = $el.is('[readonly]') || $el.is('[disabled]');
    if (isReadOnly) {
      cy.log('Exchange rate field is read-only. Verifying its value instead of typing.');
      cy.wrap($el).should('be.visible').and('have.value', String(val));
    } else {
      cy.log('Exchange rate field is editable. Typing value.');
      typeClear($el, val);
    }
  });
}

function setDebit(val) {
  findCtlByLabel(/^Debit\b/i).then(($el) => typeClear($el, val));
}

function setCredit(val) {
  findCtlByLabel(/^Credit\b/i).then(($el) => typeClear($el, val));
}

// ================== REFINED clickAddToItems ==================
function clickAddToItems() {
  cy.get("body").then(($body) => {
    if ($body.find("table:visible").length > 0) {
      cy.get("table:visible tbody tr").its("length").as("rowsBefore");
    } else {
      cy.log("Table not found initially, will check after adding item");
      cy.wrap(0).as("rowsBefore");
    }
  });

  cy.get("@jeRoot")
    .contains("button, div[role='button']", /Add to Journal Items/i)
    .scrollIntoView()
    .should("be.visible")
    .and("not.be.disabled")
    .click();

  waitForLivewireIdle();

  cy.get("table:visible, .table:visible, [role='grid']:visible", { timeout: 15000 })
    .should("be.visible")
    .then(($table) => {
      cy.log("Table found, verifying item was added");
      cy.wrap($table).find("tbody tr, [role='row']").should("have.length.at.least", 1);
      cy.wrap($table).then(($tbl) => {
        const tableText = $tbl.text();
        const has101001 = tableText.includes("101001");
        const has101002 = tableText.includes("101002");
        if (!has101001 && !has101002) {
          throw new Error("Table does not contain expected account numbers (101001 or 101002)");
        }
      });
    });
}

// ================== ONE API: addJEItem / addJEItems ==================
function addJEItem({
  accountMatcher,
  accountTypeAhead = "101",
  locationText,
  amount,
  side,
  debit,
  credit,
  currencyText = "QAR (Default)",
  exchangeRate = "1",
  narrative = "No narrative",
  department = "All",
}) {
  const { debit: d, credit: c } = resolveAmounts({
    amount,
    side,
    debit,
    credit,
  });
  selectAccount(accountMatcher, accountTypeAhead);
  if (locationText) selectLocation(locationText);
  setDepartments(department);
  setNarrative(narrative);
  setCurrency(currencyText);
  setExchangeRate(exchangeRate);
  if (d && d !== "0") setDebit(d);
  if (c && c !== "0") setCredit(c);
  clickAddToItems();
}

function addJEItems(items) {
  items.forEach((item, index) => {
    cy.log(`Adding journal item ${index + 1}/${items.length}`);
    addJEItem(item);
    if (index < items.length - 1) {
      cy.wait(1000);
    }
  });
}

// ================== SUBMIT BUTTON HELPERS ==================
function findAndClickSubmitButton() {
  // Wait for UI to stabilize
  waitForLivewireIdle();
  cy.wait(2000);
  
  // First try common containers where submit buttons might be located
  cy.get('body').then(($body) => {
    const commonContainers = $body.find('.modal-footer, .form-actions, .actions-container, .submit-section, .je-actions');
    
    if (commonContainers.length > 0) {
      cy.wrap(commonContainers).each(($container) => {
        const submitBtn = $container.find('button:contains("Submit"), [role="button"]:contains("Submit")');
        if (submitBtn.length > 0 && submitBtn.is(':visible') && !submitBtn.is(':disabled')) {
          cy.wrap(submitBtn).click({ force: true });
          return false; // break the loop
        }
      });
    } else {
      // Fallback to searching the entire body
      cy.get('button:contains("Submit"), [role="button"]:contains("Submit"), .btn-submit, .submit-btn', { timeout: 30000 })
        .scrollIntoView()
        .should('be.visible')
        .and('not.be.disabled')
        .click({ force: true });
    }
  });
}

// ================== SPEC ==================
describe("JE auto-fill account + debit/credit -> add -> grid row appears -> submit", () => {
  it("adds items and submits the JE", () => {
    loginAndBindTenant();
    openJEList();
    openJEDrawer();

    const items =
      Array.isArray(JE_ITEMS_ENV) && JE_ITEMS_ENV.length
        ? JE_ITEMS_ENV
        : [
            {
              accountMatcher: /^101001\b.*24K GOLD/i,
              accountTypeAhead: "101001",
              locationText: "HO",
              debit: 1000,
              narrative: "Debit amount",
            },
            {
              accountMatcher: /^101002\b.*22K GOLD/i,
              accountTypeAhead: "101002",
              locationText: "HO",
              credit: 1000,
              narrative: "Credit amount",
            },
          ];

    addJEItems(items);

    cy.get("table:visible, .table:visible, [role='grid']:visible", { timeout: 20000 })
      .should("be.visible")
      .within(() => {
        cy.get("tbody").then(($tbody) => {
          const tableText = $tbody.text();
          expect(tableText).to.satisfy((text) => 
            text.includes("101001") || text.includes("101002")
          );
        });
        cy.contains(/HO/).should("exist");
        cy.contains(/1,?000\.?00/).should("exist");
      });

    cy.contains(/Journal Items Balance|Balance/i).should("exist");
    cy.contains(/Balanced/i).should("exist");

    // ================== SUBMIT JOURNAL ENTRY ==================
    // Wait for everything to stabilize before looking for submit button
    waitForLivewireIdle();
    cy.wait(3000);
    
    // Debug: log all available buttons to understand what's on the page
    cy.get('button, [role="button"]').then(($buttons) => {
      const buttonTexts = $buttons.map((i, el) => el.textContent.trim()).get();
      cy.log('Available buttons:', buttonTexts);
    });
    
    // Try multiple approaches to find and click the submit button
    cy.get('body').then(($body) => {
      // Look for submit button in common containers first
      const containers = $body.find('.modal-footer, .form-actions, .actions-container, .submit-section');
      let found = false;
      
      containers.each((i, container) => {
        const submitBtn = Cypress.$(container).find('button:contains("Submit"), [role="button"]:contains("Submit")');
        if (submitBtn.length > 0 && submitBtn.is(':visible') && !submitBtn.is(':disabled')) {
          cy.wrap(submitBtn).click({ force: true });
          found = true;
          return false; // break the loop
        }
      });
      
      if (!found) {
        // Fallback to searching the entire body
        cy.contains("button, a, [role='button']", /^(Submit|Save|Post|Finalize)$/i, { timeout: 30000 })
          .scrollIntoView()
          .should("be.visible")
          .and("not.be.disabled")
          .click({ force: true });
      }
    });

    waitForLivewireIdle();

    // Verify success notification or redirect
    cy.contains(/submitted successfully|Journal Entry submitted/i, { timeout: 20000 })
      .should("be.visible");
  });
});