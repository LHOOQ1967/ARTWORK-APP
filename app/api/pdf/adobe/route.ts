
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

export async function POST(req: NextRequest) {
  try {
    const { html } = await req.json()

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()

    // ✅ Viewport stable A4 (≈96 DPI)
    await page.setViewport({
      width: 1240,
      height: 1754,
      deviceScaleFactor: 1,
    })

    await page.setContent(html, { waitUntil: 'load' })
    await page.emulateMediaType('print')


await page.evaluate(() => {
  // 🔴 Supprimer les portails Next.js (DEV)
  document.querySelectorAll('nextjs-portal').forEach(el => el.remove())
})


    // ✅ Supprimer toute UI écran
    await page.evaluate(() => {
      document.querySelectorAll('.no-print').forEach(el => el.remove())
    })

    // ✅ CSS FINAL — HERO IMAGE
    await page.addStyleTag({
      content: `
@media print {

  /* ==============================
     PAGE
     ============================== */

  body, main {
    width: 800px;
    margin: 0;
    padding: 0;
    background: white;
  }

  
  section {
    padding-top: 0 !important;
    padding-bottom: 0 !important;
  }


  /* ==============================
     TYPO
     ============================== */

  h1, h2 {
    margin-top: 12px;
    margin-bottom: 6px;
  }

  p {
    margin-top: 6px;
    margin-bottom: 6px;
  }

  /* ==============================
     1 ARTWORK = 1 PAGE
     ============================== */

  .artwork-block {
    break-after: page;
    page-break-after: always;
    padding-top: 5px;
  }

  .artwork-block:last-child {
    break-after: auto;
    page-break-after: auto;
  }

  /* ==============================
     HERO IMAGE (UNE SEULE)
     ============================== */

  .artwork-images {
    display: grid;
    grid-template-columns: 1fr;
    justify-items: left;

    margin-top: 32px;
    margin-bottom: 32px;
  }

  .artwork-image-wrapper {
    width: 800px;        /* ✅ très large */
    max-height: 600px;   /* ✅ hero size */
    height: auto;

    display: flex;
    align-items: left;
    justify-content: left;
    overflow: hidden;
  }

  .artwork-image-wrapper img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }

}
      `,
    })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      scale: 1,
      margin: {
        top: '3mm',
        bottom: '4mm',
        left: '6mm',
        right: '6mm',
      },
    })

    await browser.close()

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="artworks.pdf"',
      },
    })
  } catch (err: any) {
    console.error('PDF GENERATION ERROR', err)
    return NextResponse.json(
      { error: 'PDF generation failed', message: err?.message },
      { status: 500 }
    )
  }
}
