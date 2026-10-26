export async function printCommissionCorrections(
  table: HTMLTableElement,
  title: string,
  landscape = false
) {
  const frame = document.createElement('iframe')
  frame.title = title
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:100%;height:100%;border:0'
  document.body.append(frame)

  try {
    const printDocument = frame.contentDocument
    const printWindow = frame.contentWindow
    if (!printDocument || !printWindow) throw new Error('Unable to prepare the print document.')

    printDocument.open()
    printDocument.write('<!doctype html><html lang="en"><head></head><body></body></html>')
    printDocument.close()
    printDocument.title = title

    await Promise.all(Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), link =>
      new Promise<void>((resolve, reject) => {
        const copy = printDocument.createElement('link')
        copy.rel = 'stylesheet'
        copy.href = link.href
        copy.onload = () => resolve()
        copy.onerror = () => reject(new Error('Unable to load the print styles.'))
        printDocument.head.append(copy)
      })
    ))
    const style = printDocument.createElement('style')
    style.textContent = `
      ${landscape ? '@page { size: A4 landscape; margin: 8mm; }' : ''}
      body { margin: 16px; font-family: Arial, sans-serif; }
      h1 { font-size: 16px; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { padding: 6px 8px; }
      tr { break-inside: avoid; }
      thead { display: table-header-group; }
      tfoot { display: table-row-group; }
      a { color: inherit; }
      * { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
      ${landscape ? `
        table { table-layout: fixed; font-size: 9px !important; }
        th, td { padding: 4px 3px !important; overflow-wrap: anywhere; }
        table .no-print { display: table-cell !important; }
        table .text-xs { font-size: 8px; }
        table .text-sm { font-size: 9px; }
        table * { min-width: 0 !important; max-width: 100% !important; white-space: normal !important; }
      ` : ''}
    `
    printDocument.head.append(style)
    const heading = printDocument.createElement('h1')
    heading.textContent = title
    const copy = table.cloneNode(true) as HTMLTableElement
    if (landscape) {
      copy.querySelectorAll('button, input[type="file"], [role="alert"], [data-print-exclude]').forEach(element => element.remove())
      const originalInputs = table.querySelectorAll<HTMLInputElement>('input:not([type="file"])')
      copy.querySelectorAll<HTMLInputElement>('input:not([type="file"])').forEach((input, index) => {
        const original = originalInputs[index]
        const value = original.value
        const text = printDocument.createElement('span')
        text.textContent = original.type === 'date' && value
          ? new Intl.DateTimeFormat('en-GB').format(new Date(`${value}T00:00:00`))
          : value || original.placeholder || '—'
        input.replaceWith(text)
      })
    }
    printDocument.body.append(heading, copy)
    await printDocument.fonts.ready

    printWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
    printWindow.focus()
    printWindow.print()
  } catch (error) {
    frame.remove()
    throw error
  }
}
