/// <reference types="cypress" />

// ================== ENV ==================
const BASE        = Cypress.env('base')       || 'http://172.164.240.105';
const EMAIL       = Cypress.env('email')      || 'asjhq@asj.com';
const PASSWORD    = Cypress.env('password')   || 'password';
const TENANT_NAME = Cypress.env('tenantName') || 'ASJ Qatar';

// ================== NOISY FE ERRORS -> IGNORE ==================
Cypress.on('uncaught:exception', (err) => {
  const m = err?.message || '';
  if (
    /Snapshot missing on Livewire component/i.test(m) ||
    /Component already initialized/i.test(m) ||
    /Component not found/i.test(m) ||
    /Cannot read properties of (null|undefined) \(reading '(?:hasAttribute|uri)'\)/i.test(m) ||
    /ReferenceError:\s*option is not defined/i.test(m)
  ) return false;
  return false;
});

// ================== GENERIC HELPERS ==================
function waitForLivewireIdle() {
  cy.get('[wire\\:loading]:visible', { timeout: 30000 }).should('not.exist');
}
function typeClear($el, text) {
  cy.wrap($el).should('be.visible').click().type('{selectall}{backspace}').type(String(text));
}

// ================== LOGIN + NAV ==================
function loginAndBindTenant() {
  cy.visit(`${BASE}/login`, { failOnStatusCode: false });

  cy.get('form:visible', { timeout: 20000 }).first().within(() => {
    cy.get('input#email, input[name="email"], input[type="email"]').filter(':visible').first()
      .clear().type(EMAIL, { delay: 5 });
    cy.get('input#password, input[name="password"], input[type="password"]').filter(':visible').first()
      .clear().type(PASSWORD, { log: false, delay: 5 });

    const $btns = Cypress.$('button[type="submit"]:visible, input[type="submit"]:visible');
    if ($btns.length) cy.wrap($btns[0]).click({ force: true });
    else cy.contains('button,[type="submit"],a[role="button"],a', /log\s*in|sign\s*in|continue|submit/i)
      .first().click({ force: true });
  });

  cy.location('pathname', { timeout: 30000 }).then((p) => {
    if (p.includes('/select-tenant')) {
      cy.contains(':visible', new RegExp(`^\\s*${TENANT_NAME}\\s*$`, 'i'), { timeout: 20000 })
        .then(($label) => {
          const tgt = $label.closest('button,a,[role="button"],[tabindex],.cursor-pointer')[0] || $label[0];
          cy.wrap(tgt).scrollIntoView().click({ force: true });
        });
    }
  });

  // end state: dashboard
  cy.location('pathname', { timeout: 30000 }).should((p) => {
    expect(/\/dashboard($|\?)/.test(p)).to.eq(true);
  });
}

function openJEList() {
  cy.intercept('POST', '**/livewire/**').as('lw'); // v3 uses /livewire/update
  cy.visit(`${BASE}/journal-entries`, { failOnStatusCode: false });
  cy.wait('@lw', { timeout: 30000 });
  waitForLivewireIdle();

  cy.location('pathname', { timeout: 20000 }).should('include', '/journal-entries');
  cy.contains(':visible', /Journal\s*Entries/i, { timeout: 20000 }).should('exist');
}

// ================== JE DRAWER FIND/OPEN ==================
function openJEDrawer() {
  cy.contains('button,a,[role="button"]', /\+\s*Add\s+Journal\s+Entry/i, { timeout: 20000 })
    .scrollIntoView()
    .click({ force: true });

  // Header may be "Add Journal Item" or similar
  cy.contains(':visible', /Add\s+Journal\s+Item|Journal\s+Entry/i, { timeout: 20000 })
    .should('be.visible')
    .as('drawerHeader');

  waitForLivewireIdle();

  // Define jeRoot (closest dialog/drawer/card)
  cy.get('@drawerHeader')
    .closest('[role="dialog"],[data-dialog],.drawer,.modal,.card,div')
    .as('jeRoot');

  // minimal sanity
  cy.get('@jeRoot').within(() => {
    cy.contains(/Add to Journal Items/i).should('exist');
  });
}

// ================== JE FIELD HELPERS ==================
// robust account input finder
function getSearchAccountInput() {
  return cy.get('@jeRoot')
    .find('input:visible')
    .filter((_, el) => {
      const ph = (el.getAttribute('placeholder') || '').toLowerCase();
      return ph.includes('search') && ph.includes('account');
    })
    .first();
}

function selectAccount(optionMatcher, typeHint = '101') {
  getSearchAccountInput().as('acct');
  cy.get('@acct').click().type('{selectall}{backspace}').type(typeHint, { delay: 5 });

  // list can be <ul> or virtualized <div>
  cy.get('div,ul')
    .filter(':visible')
    .contains(optionMatcher, { timeout: 10000 })
    .click({ force: true });
}

// generalized label->control resolver (label|div|span|th|td)
function findCtlByLabel(labelRe) {
  cy.get('@jeRoot').within(() => {
    cy.contains('label,div,span,th,td', labelRe, { timeout: 10000 })
      .first()
      .then(($label) => {
        const forId = $label.attr('for');
        if (forId) {
          const $target = Cypress.$('#' + forId).filter(':visible').first();
          cy.wrap($target.length ? $target : $label).as('ctl');
        } else {
          const scope = $label.closest('div')[0] || $label.parent()[0];
          const $candidate = Cypress.$(scope)
            .find('input,textarea,select,button,[contenteditable]')
            .filter(':visible')
            .first();
          cy.wrap($candidate.length ? $candidate : $label).as('ctl');
        }
      });
  });
  return cy.get('@ctl');
}

// Location selector: tries (1) labeled native select, (2) any visible select with HO/ASJ in options,
// (3) custom dropdown button -> choose item
function selectLocation(optionMatcher) {
  // 1) labeled control (Location Tag | Location | Branch)
  findCtlByLabel(/^(Location\s*Tag|Location|Branch)\b/i).then($el => {
    const $sel = Cypress.$($el);
    if ($sel.is('select')) {
      cy.wrap($sel).select(optionMatcher, { force: true });
      return;
    }
    // 2) scan visible selects with recognizable options
    cy.get('@jeRoot')
      .find('select:visible')
      .filter((_, el) => {
        const texts = Array.from(el.options || []).map(o => (o.textContent || '').toLowerCase()).join('|');
        return /select.*location/.test(texts) || /\bho\b|\basj gold\b|\basj dia\b/.test(texts);
      })
      .then($cands => {
        if ($cands.length) {
          cy.wrap($cands[0]).select(optionMatcher, { force: true });
          return;
        }
        // 3) custom dropdown: click a visible button/toggle near “Location”
        cy.get('@jeRoot').within(() => {
          cy.contains(/^(Location\s*Tag|Location|Branch)\b/i).closest('div').within(() => {
            cy.get('button:visible, [role="button"]:visible').first().click({ force: true });
          });
        });
        cy.contains(':visible', optionMatcher, { timeout: 10000 }).click({ force: true });
      });
  });
}

function setDepartments(text) { findCtlByLabel(/^Departments?\b/i).then($el => typeClear($el, text)); }
function setNarrative(text)   { findCtlByLabel(/^Narrative|Description\b/i).then($el => typeClear($el, text)); }

function setCurrency(optionMatcher) {
  cy.get('@jeRoot').within(() => {
    cy.contains('label,div,span,th,td', /^Currency$/i).first().then($lbl => {
      const forId = $lbl.attr('for');
      if (forId) {
        const $sel = Cypress.$('#' + forId);
        if ($sel.length && $sel.is('select')) {
          cy.wrap($sel).select(optionMatcher, { force: true });
          return;
        }
      }
      // custom dropdown
      cy.wrap($lbl.closest('div')).find('button:visible,div[role="button"]:visible').first().click({ force: true });
      cy.contains(':visible', optionMatcher, { timeout: 10000 }).click({ force: true });
    });
  });
}

function setExchangeRate(val) { findCtlByLabel(/^Exchange\s*Rate/i).then($el => typeClear($el, val)); }
function setDebit(val)        { findCtlByLabel(/^Debit\b/i).then($el => typeClear($el, val)); }
function setCredit(val)       { findCtlByLabel(/^Credit\b/i).then($el => typeClear($el, val)); }

function clickAddToItems() {
  cy.intercept('POST', '**/livewire/**').as('lwAction');
  cy.get('@jeRoot').contains('button', /Add to Journal Items/i).should('be.enabled').click({ force: true });
  cy.wait('@lwAction', { timeout: 30000 });
  waitForLivewireIdle();
}

function addRow(row, fx) {
  selectAccount(new RegExp(row.accountMatcher, 'i'), row.typeHint || '101');
  selectLocation(new RegExp(row.locationMatcher, 'i')); // robust now
  setDepartments(row.department || 'All');
  setNarrative(fx.narrative);
  setCurrency(new RegExp(fx.currencyMatcher, 'i'));
  setExchangeRate(fx.exchangeRate);
  if (row.debit)  setDebit(row.debit);
  if (row.credit) setCredit(row.credit);
  clickAddToItems();
}

// ================== TEST DATA (tweak if your labels differ) ==================
const JE_FIXTURE = {
  narrative: 'No narrative',
  currencyMatcher: 'QAR.*Default',
  exchangeRate: '1',
  rows: [
    { accountMatcher: '^101001\\b.*24K GOLD', locationMatcher: '^HO$',  department: 'All', debit: '1000', credit: '0',    typeHint: '101001' },
    { accountMatcher: '^101002\\b.*22K GOLD', locationMatcher: '^HO$',  department: 'All', debit: '0',    credit: '1000', typeHint: '101002' },
  ],
  expected: { debit: /1,?000\.00/, credit: /1,?000\.00/ },
};

// ================== SPEC ==================
describe('JE – create with test data (balanced)', () => {
  it('fills the drawer and inserts two balanced items', () => {
    loginAndBindTenant();
    openJEList();
    openJEDrawer();

    addRow(JE_FIXTURE.rows[0], JE_FIXTURE);
    addRow(JE_FIXTURE.rows[1], JE_FIXTURE);

    // Assertions – flexible to avoid brittle text-casing/spacing
    cy.contains(/Journal Items Balance/i).should('exist');
    cy.contains(/Balanced/i).should('exist');

    cy.contains(/Regular Journal Balance/i).parent().within(() => {
      cy.contains(new RegExp(`Debit:\\s*${JE_FIXTURE.expected.debit.source}`, 'i')).should('exist');
      cy.contains(new RegExp(`Credit:\\s*${JE_FIXTURE.expected.credit.source}`, 'i')).should('exist');
    });

    // Spot-check rows & location
    cy.get('table:visible,[role="table"]:visible,.ag-root:visible').first().within(() => {
      cy.contains(/101001\b/).should('exist');
      cy.contains(/101002\b/).should('exist');
      cy.contains(/^\s*HO\s*$/).should('exist');
      cy.contains(/QAR\s*1,?000\.00/i).should('exist');
    });
  });
});
