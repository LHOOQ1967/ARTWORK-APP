
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

export async function POST(req: NextRequest) {
  try {
    const { html } = await req.json()

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()

    await page.setContent(html, {
      waitUntil: 'networkidle0',
    })

    // ✅ 1. Activer le mode print
    await page.emulateMediaType('print')

    // ✅ 2. SUPPRIMER physiquement les éléments non imprimables
    await page.evaluate(() => {
      document.querySelectorAll('.no-print').forEach(el => el.remove())
    })

    // ✅ 3. Générer le PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm',
      },
    })

    await browser.close()

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="artwork.pdf"',
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: 'PDF generation failed' },
      { status: 500 }
    )
  }
}
