import { useState, useEffect } from 'react'

export default function AdminPanel({ onBack }: { onBack: () => void }) {
  const [extractedTextures, setExtractedTextures] = useState<any[]>([])
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [pendingReview, setPendingReview] = useState<any[]>([])
  const [selectedForSave, setSelectedForSave] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchExtractedTextures()
  }, [])

  const fetchExtractedTextures = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/extracted-textures')
      const data = await res.json()
      setExtractedTextures(data)
    } catch (err) {
      console.error('Failed to fetch extracted textures', err)
    }
  }

  const handlePdfUpload = async () => {
    if (!pdfFile) return
    setUploadingPdf(true)
    try {
      const fd = new FormData()
      fd.append('pdf_file', pdfFile)
      const response = await fetch('http://localhost:5000/api/admin/upload-pdf', {
        method: 'POST',
        body: fd
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Upload failed')
      
      const images = data.extracted_images || []
      if (images.length === 0) {
        alert("No valid textures found in this PDF based on the filters.")
      } else {
        setPendingReview(images)
        setSelectedForSave(images.map((img: any) => img.id)) // Default select all
      }
      setPdfFile(null)
    } catch (err: any) {
      alert("Failed to upload PDF: " + err.message)
    } finally {
      setUploadingPdf(false)
    }
  }

  const handleSaveApproved = async () => {
    setSaving(true)
    try {
      const approvedImages = pendingReview.filter(img => selectedForSave.includes(img.id))
      const response = await fetch('http://localhost:5000/api/admin/save-textures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_images: approvedImages })
      })
      if (!response.ok) throw new Error('Failed to save')
      
      setPendingReview([])
      setSelectedForSave([])
      fetchExtractedTextures()
      alert("Selected textures have been added to the catalog!")
    } catch (err: any) {
      alert("Error saving textures: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedForSave(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 bg-white hover:bg-gray-100 rounded-full shadow-sm transition-colors border border-gray-200">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
          </div>
        </header>

        <section className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mb-8">
          <h2 className="text-xl font-semibold mb-2">Upload Catalog (PDF)</h2>
          <p className="text-gray-500 mb-6 text-sm">Automatically extract backgrounds and textures from a design catalog.</p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4 p-6 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <label className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Select PDF Catalog
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
            </label>
            {pdfFile && <span className="text-sm text-green-600 font-medium truncate max-w-xs">{pdfFile.name}</span>}
            
            <div className="flex-1"></div>

            <button onClick={handlePdfUpload} disabled={!pdfFile || uploadingPdf} className="bg-[#a82b34] text-white px-8 py-2.5 rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-[#8a222a] shadow-md transition-all flex items-center gap-2">
              {uploadingPdf && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              {uploadingPdf ? 'Extracting Textures...' : 'Upload & Extract'}
            </button>
          </div>
        </section>

        {pendingReview.length > 0 && (
          <section className="bg-white p-8 rounded-2xl shadow-sm border border-yellow-200 mb-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400"></div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">Review Extracted Images</h2>
                <p className="text-gray-500 text-sm">Select the valid textures you want to add to the public catalog. Click to toggle.</p>
              </div>
              <button 
                onClick={handleSaveApproved} 
                disabled={saving || selectedForSave.length === 0}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-green-700 shadow-md transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : `Approve ${selectedForSave.length} Textures`}
              </button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
              {pendingReview.map((img) => {
                const isSelected = selectedForSave.includes(img.id)
                return (
                  <div 
                    key={img.id} 
                    onClick={() => toggleSelect(img.id)}
                    className={`relative aspect-square rounded-xl cursor-pointer overflow-hidden transition-all duration-200 ${isSelected ? 'ring-4 ring-green-500 ring-offset-2 shadow-md scale-95' : 'border border-gray-200 opacity-60 hover:opacity-100 hover:shadow-lg'}`}
                  >
                    <img src={img.url} className="w-full h-full object-cover" />
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1 shadow-sm">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xl font-semibold mb-4">Extracted Catalog ({extractedTextures.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {extractedTextures.map((tex) => (
              <div key={tex.id} className="aspect-square bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden group">
                <img src={tex.url} alt="texture" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              </div>
            ))}
            {extractedTextures.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                No textures extracted yet. Upload a PDF catalog above.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
