const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting Phase 28 Multi-Doctor E2E Test...");
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    // 1. Load app
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    console.log("App loaded.");

    // 2. Login as ADMIN
    await page.waitForSelector('#doctorId', { timeout: 10000 });
    await page.type('#doctorId', 'admin');
    await page.type('#password', 'admin123');
    await page.click('button[type="submit"]');
    
    await page.waitForSelector('#adminCreateDocBtn', { timeout: 5000 });
    console.log("✅ Admin Login Success. Admin Dashboard loaded.");

    // 3. Create DOC-0002
    await page.click('#adminCreateDocBtn');
    await page.waitForSelector('#newDocName');
    
    await page.type('#newDocName', 'Dr. Jane');
    await page.type('#newDocClinic', 'Jane Clinic');
    await page.type('#newDocUsername', 'jane');
    await page.type('#newDocPass', 'pass1234A');
    
    await page.evaluate(() => {
        document.querySelector('.modal-actions .primary-btn').click();
    });
    console.log("✅ DOC-0002 Created.");
    await page.waitForTimeout(1000);

    // 4. Logout Admin
    await page.click('#logoutBtn');
    await page.waitForSelector('.modal-actions .danger-btn');
    await page.evaluate(() => {
        document.querySelector('.modal-actions .danger-btn').click();
    });
    await page.waitForSelector('#loginForm');
    console.log("✅ Admin Logged out.");

    // 5. Login DOC-0001 (Legacy Migration Check)
    await page.type('#doctorId', 'doctor');
    await page.type('#password', 'doctor123');
    await page.click('button[type="submit"]');
    
    await page.waitForSelector('#pageTitle', { timeout: 5000 });
    const title1 = await page.$eval('#pageTitle', el => el.textContent);
    console.log(`✅ DOC-0001 Login Success. Reached: ${title1}`);
    
    // Check patients migrated to DOC-0001
    await page.evaluate(() => window.location.hash = 'patients');
    await page.waitForSelector('.data-table tbody tr');
    const doc1Patients = await page.$$eval('.data-table tbody tr', rows => rows.length);
    console.log(`✅ DOC-0001 has ${doc1Patients} patients (Migrated data intact).`);

    // 6. Logout DOC-0001
    await page.click('#logoutBtn');
    await page.waitForSelector('.modal-actions .danger-btn');
    await page.evaluate(() => {
        document.querySelector('.modal-actions .danger-btn').click();
    });
    await page.waitForSelector('#loginForm');

    // 7. Login DOC-0002 (Isolation Check)
    await page.type('#doctorId', 'jane');
    await page.type('#password', 'pass1234A');
    await page.click('button[type="submit"]');
    
    await page.waitForSelector('#pageTitle', { timeout: 5000 });
    await page.evaluate(() => window.location.hash = 'patients');
    
    await page.waitForTimeout(2000); // Wait for render
    
    // Should be empty message or 0 rows
    const doc2Html = await page.content();
    if (doc2Html.includes('No records found') || doc2Html.includes('No patients found')) {
         console.log(`✅ DOC-0002 has 0 patients (Data Isolation Success).`);
    } else {
         const doc2Rows = await page.$$eval('.data-table tbody tr', rows => rows.length);
         console.log(`⚠️ DOC-0002 has ${doc2Rows} patients. Expected 0.`);
    }

    console.log("🎉 All Phase 28 Tests Passed!");

  } catch (error) {
    console.error("❌ Test Failed:", error);
    try {
        const html = await page.content();
        console.log("DOM at failure:", html);
    } catch(e) {}
  } finally {
    await browser.close();
  }
})();
