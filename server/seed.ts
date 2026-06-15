/**
 * This project does not use seeded demo data.
 * To provision a new tenant, POST to /api/tenants with:
 *
 *   {
 *     "slug": "your-pharmacy",
 *     "name": "Your Pharmacy Name",
 *     "ownerName": "Owner Full Name",
 *     "ownerEmail": "owner@example.com",
 *     "ownerPassword": "SecurePassword123!",
 *     "subscriptionPlan": "basic"
 *   }
 *
 * After creation you will receive a JWT token to use for all subsequent requests.
 */
console.log('No seed required. Create tenants via POST /api/tenants.');
process.exit(0);
