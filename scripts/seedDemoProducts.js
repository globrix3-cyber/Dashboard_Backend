/* One-off seed: populates demo supplier companies + a Faire-style product catalog
   for local development (the live `products` table starts out empty). Run with:
     node scripts/seedDemoProducts.js
*/
require('dotenv').config();
const pool = require('../config/db');

const img = (seed) => `https://picsum.photos/seed/${seed}/900/900`;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);

const SUPPLIERS = [
  {
    key: 'jaipur',
    legal_name: 'Jaipur Looms Private Limited', brand_name: 'Jaipur Looms Co.',
    country: 'IN', state_province: 'Rajasthan', city: 'Jaipur', pincode: '302001',
    website: 'https://jaipurlooms.example.com', logo_url: img('jaipur-looms-logo'),
    description: 'Family-run weaving house specialising in hand block-printed and naturally dyed cotton textiles, exporting since 1987.',
    employee_count: '51-200', verified_status: 'verified',
    linkUserEmail: 'supplier@example.com',
  },
  {
    key: 'coastal',
    legal_name: 'Coastal Spice Traders LLP', brand_name: 'Coastal Spice Traders',
    country: 'IN', state_province: 'Kerala', city: 'Kochi', pincode: '682001',
    website: 'https://coastalspice.example.com', logo_url: img('coastal-spice-logo'),
    description: 'Direct-from-farm exporters of Malabar pepper, cardamom and turmeric — GI-certified and lab-tested for export-grade purity.',
    employee_count: '11-50', verified_status: 'verified',
    linkUserEmail: 'drenhiti87@gmail.com',
  },
  {
    key: 'surat',
    legal_name: 'Surat Silk & Weaves Pvt Ltd', brand_name: 'Surat Silk & Weaves',
    country: 'IN', state_province: 'Gujarat', city: 'Surat', pincode: '395003',
    website: 'https://suratsilk.example.com', logo_url: img('surat-silk-logo'),
    description: 'Surat-based mill producing sarees, kurta sets and shirting in silk, georgette and cotton for wholesale and export buyers.',
    employee_count: '201-500', verified_status: 'verified',
  },
  {
    key: 'moradabad',
    legal_name: 'Moradabad Metal Crafts Co.', brand_name: 'Moradabad Metal Crafts',
    country: 'IN', state_province: 'Uttar Pradesh', city: 'Moradabad', pincode: '244001',
    website: 'https://moradabadmetal.example.com', logo_url: img('moradabad-metal-logo'),
    description: 'Three generations of brass and copper artisans producing hand-engraved homeware and décor for the global gifting trade.',
    employee_count: '11-50', verified_status: 'verified',
  },
  {
    key: 'noida',
    legal_name: 'Noida Lighting Works Pvt Ltd', brand_name: 'Noida Lighting Works',
    country: 'IN', state_province: 'Uttar Pradesh', city: 'Noida', pincode: '201301',
    website: 'https://noidalighting.example.com', logo_url: img('noida-lighting-logo'),
    description: 'BIS-certified manufacturer of LED panels, solar garden lights and smart fixtures for retail and hospitality buyers.',
    employee_count: '51-200', verified_status: 'pending',
  },
  {
    key: 'saharanpur',
    legal_name: 'Saharanpur Woodcraft Exports', brand_name: 'Saharanpur Woodcraft',
    country: 'IN', state_province: 'Uttar Pradesh', city: 'Saharanpur', pincode: '247001',
    website: 'https://saharanpurwood.example.com', logo_url: img('saharanpur-wood-logo'),
    description: 'Sheesham and teak furniture workshop producing dining sets, coffee tables and carved décor for wholesale export.',
    employee_count: '51-200', verified_status: 'verified',
  },
];

const PRODUCTS = [
  // ── Jaipur Looms Co. ──────────────────────────────────────────────────────
  {
    supplier: 'jaipur', category: 'Fabric & Raw Material', images: 3,
    name: 'Hand Block-Printed Cotton Fabric — Sanganeri Print',
    description: 'Pure cotton yardage hand block-printed with traditional Sanganeri wooden blocks and natural dyes. Sold by the bulk roll for garment and home-furnishing manufacturers.',
    moq: 200, unit: 'meters', price: 285, lead: 18, hs: '5208.52',
    variants: { Color: ['Indigo Blue', 'Mustard Yellow', 'Terracotta Red'] },
  },
  {
    supplier: 'jaipur', category: 'Fabric & Raw Material', images: 2,
    name: 'Organic Khadi Cotton Yardage — Natural Indigo Dye',
    description: 'Handspun, handwoven khadi cotton dyed with natural indigo and finished to GOTS-compliant standards — ideal for sustainable apparel lines.',
    moq: 150, unit: 'meters', price: 340, lead: 21, hs: '5208.11',
  },
  {
    supplier: 'jaipur', category: "Women's Clothing", images: 3,
    name: 'Rajasthani Bandhani Dupattas — Bulk Pack of 12',
    description: 'Tie-dye Bandhani dupattas in georgette with hand-rolled edges, packed in assorted colourways and ready for retail tagging.',
    moq: 5, unit: 'packs', price: 2150, lead: 14, hs: '6214.30',
    variants: { Color: ['Pink & Yellow', 'Red & Green', 'Blue & Orange'] },
  },

  // ── Surat Silk & Weaves ───────────────────────────────────────────────────
  {
    supplier: 'surat', category: "Women's Clothing", images: 4,
    name: 'Banarasi Silk Sarees — Wedding Collection',
    description: 'Handwoven Banarasi silk sarees with zari brocade borders, presented in branded boxes ready for retail display.',
    moq: 10, unit: 'pieces', price: 3800, lead: 25, hs: '5007.20',
    variants: { Color: ['Maroon & Gold', 'Emerald & Gold', 'Royal Blue & Silver'] },
  },
  {
    supplier: 'surat', category: "Women's Clothing", images: 3,
    name: 'Embroidered Georgette Kurta Sets — Pack of 6',
    description: 'Three-piece kurta, dupatta and trouser sets finished with thread embroidery — supplied in mixed size runs for boutique resale.',
    moq: 20, unit: 'sets', price: 5400, lead: 20, hs: '6204.43',
    variants: { Size: ['S', 'M', 'L', 'XL'], Color: ['Powder Blue', 'Blush Pink', 'Sage Green', 'Ivory'] },
  },
  {
    supplier: 'surat', category: "Men's Clothing", images: 2,
    name: "Men's Cotton Formal Shirts — Wholesale Carton of 10",
    description: 'Tailored cotton formal shirts in classic fits, pre-packed by size run for retail and corporate-uniform suppliers.',
    moq: 5, unit: 'cartons', price: 4200, lead: 16, hs: '6205.20',
    specs: [{ attr: 'Material', value: 'Cotton' }, { attr: 'Size Range', value: 'L' }],
  },

  // ── Coastal Spice Traders ─────────────────────────────────────────────────
  {
    supplier: 'coastal', category: 'Spices & Condiments', images: 2,
    name: 'Malabar Black Pepper — Whole, Export Grade (650 g/l)',
    description: 'Sun-dried Tellicherry peppercorns at export-grade density of 650 g/l, vacuum-packed for freshness with lab certificates available on request.',
    moq: 500, unit: 'kg', price: 612, lead: 12, hs: '0904.11',
  },
  {
    supplier: 'coastal', category: 'Spices & Condiments', images: 2,
    name: 'Kashmiri Red Chilli Powder — 1 kg Pouches, Carton of 20',
    description: 'Vibrant, low-heat Kashmiri chilli powder stone-ground in small batches and packed in food-grade laminated pouches.',
    moq: 50, unit: 'cartons', price: 3200, lead: 10, hs: '0904.22',
  },
  {
    supplier: 'coastal', category: 'Spices & Condiments', images: 2,
    name: 'High-Curcumin Organic Turmeric Powder',
    description: 'Single-origin Erode turmeric with 5%+ curcumin content, certified organic and milled to a fine wholesale-grade powder.',
    moq: 200, unit: 'kg', price: 285, lead: 9, hs: '0910.30',
  },
  {
    supplier: 'coastal', category: 'Grains & Pulses', images: 2,
    name: 'Premium 1121 Sella Basmati Rice — 25 kg Bags',
    description: 'Aged extra-long-grain Sella basmati sourced directly from Punjab paddy fields and double-sortexed to export quality.',
    moq: 100, unit: 'bags', price: 1850, lead: 14, hs: '1006.30',
  },

  // ── Moradabad Metal Crafts ────────────────────────────────────────────────
  {
    supplier: 'moradabad', category: 'Handicrafts & Gifts', images: 3,
    name: 'Hand-Engraved Brass Decorative Bowls — Set of 4',
    description: 'Cast brass bowls with traditional hand-chiselled floral motifs, antique-finished and individually polished by master karigars.',
    moq: 25, unit: 'sets', price: 1640, lead: 22, hs: '7418.19',
  },
  {
    supplier: 'moradabad', category: 'Handicrafts & Gifts', images: 3,
    name: 'Hammered Copper Moscow Mule Mugs — Bulk Pack of 24',
    description: 'Food-safe hammered copper mugs with brass handles, individually seam-checked — a bestselling bar and gifting SKU for resellers.',
    moq: 10, unit: 'packs', price: 5760, lead: 18, hs: '7418.19',
  },
  {
    supplier: 'moradabad', category: 'Handicrafts & Gifts', images: 3,
    name: 'Hand-Carved Wood & Iron Wall Décor Panels',
    description: 'Mango-wood panels with wrought-iron jali inlay finished in distressed walnut stain — ship flat-packed for efficient freight.',
    moq: 30, unit: 'pieces', price: 980, lead: 20, hs: '4420.10',
  },

  // ── Noida Lighting Works ──────────────────────────────────────────────────
  {
    supplier: 'noida', category: 'LED Lighting', images: 2,
    name: '12 W LED Panel Lights — Cool White, Carton of 40',
    description: 'Slim-profile ceiling panel lights, BIS-certified with a 50,000-hour rated lifespan, supplied complete with mounting frames and drivers.',
    moq: 10, unit: 'cartons', price: 7200, lead: 15, hs: '8539.50',
    specs: [{ attr: 'Wattage', value: 12 }],
  },
  {
    supplier: 'noida', category: 'LED Lighting', images: 2,
    name: 'Solar Garden Pathway Lights — Weatherproof, Pack of 20',
    description: 'IP65-rated solar pathway lights with dusk-to-dawn sensors and 8-hour battery backup, packed retail-ready for resale.',
    moq: 25, unit: 'packs', price: 4100, lead: 17, hs: '8513.10',
    specs: [{ attr: 'Wattage', value: 3 }],
  },
  {
    supplier: 'noida', category: 'LED Lighting', images: 2,
    name: 'Smart RGB LED Strip Lights — 5 m Reels, Carton of 30',
    description: 'App- and voice-controlled RGB strip lights with adhesive backing and 16-million colour presets — popular with home-décor resellers.',
    moq: 12, unit: 'cartons', price: 9300, lead: 19, hs: '8539.50',
    specs: [{ attr: 'Wattage', value: 14.4 }],
  },

  // ── Saharanpur Woodcraft ──────────────────────────────────────────────────
  {
    supplier: 'saharanpur', category: 'Furniture', images: 3,
    name: 'Sheesham Wood Dining Chair Sets — Set of 6',
    description: 'Solid sheesham-wood dining chairs with a hand-rubbed walnut finish and woven cane seats, kiln-dried to export moisture standards.',
    moq: 5, unit: 'sets', price: 18500, lead: 35, hs: '9403.60',
  },
  {
    supplier: 'saharanpur', category: 'Furniture', images: 2,
    name: 'Foldable Teak Wood Coffee Tables',
    description: 'Compact folding-leg coffee tables in solid teak with a natural oil finish, designed for flat-pack export shipping.',
    moq: 15, unit: 'pieces', price: 6200, lead: 28, hs: '9403.60',
  },
  {
    supplier: 'saharanpur', category: 'Handicrafts & Gifts', images: 3,
    name: 'Hand-Carved Wooden Jewellery Boxes — Bulk Lot of 50',
    description: 'Brass-inlaid sheesham jewellery boxes with velvet-lined interiors, individually carved and finish-checked before packing.',
    moq: 2, unit: 'lots', price: 13500, lead: 24, hs: '4420.90',
  },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Supplier companies ────────────────────────────────────────────
    const companyIds = {};
    for (const s of SUPPLIERS) {
      const { rows: [c] } = await client.query(
        `INSERT INTO companies
           (legal_name, brand_name, is_buyer, is_supplier, country, state_province, city, pincode,
            website, logo_url, description, employee_count, verified_status)
         VALUES ($1,$2,false,true,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [s.legal_name, s.brand_name, s.country, s.state_province, s.city, s.pincode,
         s.website, s.logo_url, s.description, s.employee_count, s.verified_status]
      );
      companyIds[s.key] = c.id;

      if (s.linkUserEmail) {
        const { rows: [u] } = await client.query(`SELECT id FROM users WHERE email = $1`, [s.linkUserEmail]);
        if (u) {
          await client.query(
            `INSERT INTO company_users (user_id, company_id) VALUES ($1, $2)
             ON CONFLICT (user_id) DO NOTHING`,
            [u.id, companyIds[s.key]]
          );
        }
      }
    }

    // ── 2. Lookups ────────────────────────────────────────────────────────
    const { rows: cats } = await client.query(`SELECT id, name FROM categories`);
    const catId = (name) => {
      const found = cats.find(c => c.name === name);
      if (!found) throw new Error(`Category not found: ${name}`);
      return found.id;
    };

    const { rows: attrs } = await client.query(`SELECT id, name, category_id, data_type FROM category_attributes`);
    const findAttr = (categoryId, attrName) => attrs.find(a => a.category_id === categoryId && a.name === attrName) || null;

    // ── 3. Products + images + variants + specs ──────────────────────────
    let count = 0;
    for (const p of PRODUCTS) {
      const categoryId = catId(p.category);
      const { rows: [prod] } = await client.query(
        `INSERT INTO products
           (supplier_company_id, category_id, name, description, min_order_quantity, moq_unit,
            base_price, currency, lead_time_days, hs_code, country_of_origin, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'INR',$8,$9,'IN','active')
         RETURNING id`,
        [companyIds[p.supplier], categoryId, p.name, p.description, p.moq, p.unit, p.price, p.lead, p.hs]
      );
      const productId = prod.id;
      const slug = slugify(p.name);
      count++;

      const imgCount = p.images || 2;
      for (let i = 0; i < imgCount; i++) {
        await client.query(
          `INSERT INTO product_images (product_id, image_url, alt_text, sort_order) VALUES ($1, $2, $3, $4)`,
          [productId, img(`${slug}-${i + 1}`), p.name, i]
        );
      }

      if (p.variants) {
        const keys = Object.keys(p.variants);
        const groups = keys.map(k => p.variants[k]);
        const rowCount = Math.max(...groups.map(g => g.length));
        for (let i = 0; i < rowCount; i++) {
          const attributes = {};
          keys.forEach((k, gi) => { attributes[k] = groups[gi][i % groups[gi].length]; });
          const variantName = keys.map(k => attributes[k]).join(' / ');
          await client.query(
            `INSERT INTO product_variants (product_id, variant_name, sku, price_modifier, attributes, is_active)
             VALUES ($1, $2, $3, 0, $4, true)`,
            [productId, variantName, `${slug}-${i + 1}`.toUpperCase().slice(0, 40), JSON.stringify(attributes)]
          );
        }
      }

      if (p.specs) {
        for (const spec of p.specs) {
          const attr = findAttr(categoryId, spec.attr);
          if (!attr) continue;
          if (attr.data_type === 'number') {
            await client.query(
              `INSERT INTO product_specifications (product_id, category_attribute_id, value_numeric) VALUES ($1, $2, $3)`,
              [productId, attr.id, spec.value]
            );
          } else {
            await client.query(
              `INSERT INTO product_specifications (product_id, category_attribute_id, value_text) VALUES ($1, $2, $3)`,
              [productId, attr.id, spec.value]
            );
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log(`✓ Seeded ${SUPPLIERS.length} supplier companies and ${count} demo products.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
