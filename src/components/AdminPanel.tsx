import { useState, useEffect, useRef } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { 
  Upload, 
  ChevronLeft, 
  Grid, 
  Crop as CropIcon, 
  Save, 
  Trash2, 
  Plus, 
  Check, 
  Loader2,
  Image as ImageIcon,
  FileText,
  MousePointer2,
  Type,
  Zap,
  Target,
  Copy,
  MousePointer,
  ExternalLink
} from 'lucide-react'

interface PDFPage {
  url: string;
}

interface FilterItem {
  id?: number;
  url: string;
  image_path: string;
  code: string;
  isNew?: boolean;
}

interface DetectedCode {
  code: string;
  left: number;
  top: number;
  width: number;
  height: number;
  x: number;
  y: number;
}

export default function AdminPanel({ onBack, onLogout, userName }: { onBack: () => void, onLogout: () => void, userName?: string }) {
  const [view, setView] = useState<'upload' | 'gallery' | 'editor'>('upload')
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const [selectedPage, setSelectedPage] = useState<string | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(localStorage.getItem('pdf_path'))
  const [uploading, setUploading] = useState(false)
  
  // Modes
  const [mode, setMode] = useState<'crop' | 'select'>('crop')
  
  // Crop state
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 })
  const imgRef = useRef<HTMLImageElement>(null)

  // Filters grid state
  const [filters, setFilters] = useState<FilterItem[]>([])
  const [cropping, setCropping] = useState(false)
  const [zoom, setZoom] = useState(1)
  
  // OCR & Selection state
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [detectingCode, setDetectingCode] = useState(false)
  const [detectedCodes, setDetectedCodes] = useState<DetectedCode[]>([])
  const [clickPos, setClickPos] = useState<{ x: number, y: number } | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Keyboard Shortcuts (ALT to Select)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) setMode('select')
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) setMode('crop')
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    if (pdfPath) {
      localStorage.setItem('pdf_path', pdfPath)
    }
  }, [pdfPath])

  useEffect(() => {
    fetchPages()
    fetchFilters()
  }, [])

  useEffect(() => {
    if (selectedPage) {
      fetchDetectedCodes(selectedPage)
    }
  }, [selectedPage])

  const fetchPages = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/pages')
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setPdfPages(data)
        setView('gallery')
      }
    } catch (err) {
      console.error('Failed to fetch pages', err)
    }
  }

  const fetchFilters = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/filters')
      const data = await res.json()
      setFilters(data)
    } catch (err) {
      console.error('Failed to fetch filters', err)
    }
  }

  const fetchDetectedCodes = async (url: string) => {
    setDetectingCode(true)
    try {
      const res = await fetch('http://localhost:5000/api/detect-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page_url: url })
      })
      const data = await res.json()
      if (data.success) {
        setDetectedCodes(data.codes)
      }
    } catch (err) {
      console.error('Failed to detect codes', err)
    } finally {
      setDetectingCode(false)
    }
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const fd = new FormData()
    fd.append('pdf_file', file)

    try {
      const res = await fetch('http://localhost:5000/api/upload-pdf', {
        method: 'POST',
        body: fd
      })
      const data = await res.json()
      if (data.success) {
        setPdfPages(data.pages)
        setPdfPath(data.pdf_path)
        setView('gallery')
      } else {
        alert(data.error || 'Upload failed')
      }
    } catch (err) {
      alert('Upload failed. Check console for details.')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const handlePageClick = (pageUrl: string) => {
    setSelectedPage(pageUrl)
    setView('editor')
    setCrop(undefined)
    setCompletedCrop(undefined)
    setZoom(1)
    setActiveIndex(null)
    setDetectedCodes([])
    setMode('crop')
  }

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height, naturalWidth, naturalHeight } = e.currentTarget
    setImgDimensions({ width, height, naturalWidth, naturalHeight })
    
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 50 }, 1, width, height),
      width,
      height
    )
    setCrop(initialCrop)
  }

  const handleAddToGrid = async () => {
    if (!completedCrop || !selectedPage) return

    setCropping(true)
    try {
      const scaleX = imgDimensions.naturalWidth / imgDimensions.width
      const scaleY = imgDimensions.naturalHeight / imgDimensions.height

      const cropData = {
        page_url: selectedPage,
        x: completedCrop.x * scaleX,
        y: completedCrop.y * scaleY,
        width: completedCrop.width * scaleX,
        height: completedCrop.height * scaleY,
      }

      // 1. Crop Image
      const cropRes = await fetch('http://localhost:5000/api/crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cropData)
      })
      const imageData = await cropRes.json()
      if (!imageData.success) throw new Error(imageData.error || 'Crop failed')

      // 2. Get Code Automatically
      let assignedCode = 'UNKNOWN'
      if (pdfPath) {
        try {
          const codeRes = await fetch("http://localhost:5000/api/get-code-from-pdf", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              page_url: selectedPage,
              x: completedCrop.x,
              y: completedCrop.y,
              width: completedCrop.width,
              height: completedCrop.height,
              scale_x: scaleX,
              scale_y: scaleY,
              pdf_path: pdfPath
            })
          })
          const codeData = await codeRes.json()
          if (codeData.success && codeData.code) {
            assignedCode = codeData.code
          }
        } catch (err) {
          console.error('Auto code extraction failed', err)
        }
      }

      // 3. Auto-Save Filter
      const saveRes = await fetch('http://localhost:5000/api/save-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path: imageData.image_path,
          code: assignedCode
        })
      })
      const saveData = await saveRes.json()

      // 4. Update UI
      const newFilter: FilterItem = {
        id: saveData.id, // Assuming save-filter returns the ID
        url: imageData.url,
        image_path: imageData.image_path,
        code: assignedCode,
        isNew: false // It's already saved
      }
      
      setFilters(prev => [newFilter, ...prev])
      fetchFilters() // Refresh list to get real IDs and state
      
      if (assignedCode === 'UNKNOWN') {
        alert('Code not detected, please edit the code manually in the grid.')
      }

    } catch (err: any) {
      console.error('Automated process failed', err)
      alert(err.message || 'Failed to create filter')
    } finally {
      setCropping(false)
    }
  }

  const handleImageClick = async (e: React.MouseEvent) => {
    if (mode !== 'select') return

    if (activeIndex === null) {
      alert('Please select a filter card from the grid first.')
      setMode('crop')
      return
    }

    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom

    setClickPos({ x: e.clientX, y: e.clientY })
    setTimeout(() => setClickPos(null), 800)

    setDetectingCode(true)
    try {
      const scaleX = imgDimensions.naturalWidth / imgDimensions.width
      const scaleY = imgDimensions.naturalHeight / imgDimensions.height

      const res = await fetch('http://localhost:5000/api/get-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_url: selectedPage,
          x,
          y,
          scale_x: scaleX,
          scale_y: scaleY
        })
      })
      const data = await res.json()
      if (data.success && data.code) {
        handleManualCodeAssign(data.code)
        setMode('crop')
      } else {
        alert(data.message || 'Code not detected, try again')
      }
    } catch (err) {
      console.error('OCR failed', err)
    } finally {
      setDetectingCode(false)
    }
  }

  const handleManualCodeAssign = (code: string) => {
    if (activeIndex === null) return
    const newFilters = [...filters]
    newFilters[activeIndex].code = code
    setFilters(newFilters)
    
    // Visual feedback
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 1000)
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handleSaveFilter = async (index: number) => {
    const filter = filters[index]
    if (!filter.code) {
      alert('Please enter a code for this filter.')
      return
    }

    try {
      const res = await fetch('http://localhost:5000/api/save-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_path: filter.image_path,
          code: filter.code
        })
      })
      const data = await res.json()
      if (data.success) {
        const updatedFilters = [...filters]
        updatedFilters[index].isNew = false
        setFilters(updatedFilters)
        fetchFilters()
      }
    } catch (err) {
      console.error('Save failed', err)
    }
  }

  const handleDeleteFilter = async (index: number) => {
    const filter = filters[index]
    if (!filter.id) {
      setFilters(prev => prev.filter((_, i) => i !== index))
      if (activeIndex === index) setActiveIndex(null)
      return
    }

    try {
      const res = await fetch(`http://localhost:5000/api/filter?id=${filter.id}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        setFilters(prev => prev.filter((_, i) => i !== index))
        if (activeIndex === index) setActiveIndex(null)
      }
    } catch (err) {
      console.error('Delete failed', err)
    }
  }

  const scaleX = imgDimensions.naturalWidth / imgDimensions.width;
  const scaleY = imgDimensions.naturalHeight / imgDimensions.height;

  // Unique detected codes for the list panel
  const uniqueDetectedCodes = Array.from(new Set(detectedCodes.map(d => d.code))).map(code => {
    return detectedCodes.find(d => d.code === code);
  }).filter(Boolean) as DetectedCode[];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans overflow-hidden">
      {/* Admin Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm px-4 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            onClick={view === 'editor' ? () => setView('gallery') : onBack} 
            className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
          >
            <ChevronLeft className="w-6 h-6 text-gray-400 group-hover:text-gray-900" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-xl font-bold text-gray-900 tracking-tight leading-none">Catalog Manager</h1>
              <p className="text-[9px] sm:text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-1">Admin Workspace</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-3 pr-3 sm:pr-6 border-r border-gray-200">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider leading-none mb-1">Administrator</p>
              <p className="text-sm font-bold text-gray-900">Hello, {userName || 'Admin'}</p>
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-md ring-2 ring-white text-xs sm:text-base">
              {(userName || 'A').charAt(0).toUpperCase()}
            </div>
          </div>
          
          <button 
            onClick={onLogout}
            className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-bold text-gray-500 hover:text-red-600 transition-all active:scale-95 group px-2 sm:px-3 py-2 rounded-xl hover:bg-red-50"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-red-100 group-hover:text-red-600 transition-colors">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <span className="hidden xs:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="max-w-7xl mx-auto h-full">
          {view === 'upload' && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-xl border border-gray-100 text-center">
                <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6"><FileText className="w-10 h-10 text-[#a82b34]" /></div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Catalog</h2>
                <p className="text-gray-500 mb-8">Select a PDF file to extract pages and create wallpaper filters.</p>
                <label className="relative group cursor-pointer block">
                  <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={uploading} />
                  <div className="w-full py-4 px-6 bg-[#a82b34] hover:bg-[#8a222a] text-white rounded-xl font-bold transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-3">
                    {uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing PDF...</> : <><Upload className="w-5 h-5" /> Select PDF File</>}
                  </div>
                </label>
                <p className="mt-6 text-xs text-gray-400">Supported format: PDF only. Max size: 50MB.</p>
              </div>
            </div>
          )}

          {view === 'gallery' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3"><ImageIcon className="w-6 h-6 text-[#a82b34]" /> Catalog Pages</h2>
                <span className="text-sm text-gray-500 font-medium bg-white px-3 py-1 rounded-full border border-gray-200">{pdfPages.length} Pages Extracted</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {pdfPages.map((url, i) => (
                  <div key={i} onClick={() => handlePageClick(url)} className="group relative aspect-[3/4] bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all border border-gray-100 cursor-pointer">
                    <img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all bg-white text-gray-800 px-4 py-2 rounded-lg font-bold text-sm shadow-xl flex items-center gap-2"><CropIcon className="w-4 h-4" /> Open Editor</div>
                    </div>
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-2 py-1 rounded-md text-[10px] font-bold text-gray-600 border border-gray-200">PAGE {i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'editor' && selectedPage && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8 min-h-0 lg:h-[calc(100vh-160px)]">
              <div className="lg:col-span-3 flex flex-col min-h-0">
                <div className="bg-white rounded-3xl shadow-md border border-gray-200 flex flex-col h-full overflow-hidden relative">
                  <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white flex flex-col sm:flex-row items-center justify-between sticky top-0 z-10 gap-4">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-6 w-full sm:w-auto">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2"><div className="p-1.5 bg-red-50 rounded-lg"><CropIcon className="w-4 h-4 text-[#a82b34]" /></div> Editor</h3>
                      
                      <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200/50">
                        <button 
                          onClick={() => setMode('crop')} 
                          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${mode === 'crop' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          <Target className="w-3.5 h-3.5" /> Crop
                        </button>
                        <button 
                          onClick={() => setMode('select')} 
                          className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${mode === 'select' ? 'bg-white text-[#a82b34] shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          <Type className="w-3.5 h-3.5" /> Select
                        </button>
                      </div>

                      <div className="flex items-center gap-4 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Zoom</span>
                        <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-24 sm:w-32 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#a82b34]" />
                        <span className="text-sm font-bold text-[#a82b34] min-w-[3ch]">{zoom.toFixed(1)}x</span>
                      </div>
                      
                      <div className="hidden xl:flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                        <Zap className="w-3 h-3 text-blue-500" />
                        Hold <kbd className="bg-white px-1.5 py-0.5 rounded border border-gray-300 shadow-sm mx-1">ALT</kbd> to Select
                      </div>
                    </div>
                    <button onClick={handleAddToGrid} disabled={!completedCrop || cropping} className="w-full sm:w-auto bg-[#a82b34] text-white px-6 sm:px-8 py-2.5 rounded-xl font-bold text-sm hover:bg-[#8a222a] disabled:opacity-50 transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-2">
                      {cropping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add to Grid
                    </button>
                  </div>
                  
                  <div className={`flex-1 overflow-auto bg-[#f8f9fa] p-8 md:p-12 ${mode === 'select' ? 'cursor-text' : 'cursor-crosshair'}`}>
                    <div className="flex items-center justify-center min-h-full min-w-full">
                      <div style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s', transformOrigin: 'center center' }} className="bg-white rounded-lg overflow-hidden relative shadow-2xl">
                        <ReactCrop 
                          crop={crop} 
                          onChange={c => mode === 'crop' && setCrop(c)} 
                          onComplete={c => mode === 'crop' && setCompletedCrop(c)}
                          disabled={mode === 'select'}
                        >
                          <img 
                            ref={imgRef} 
                            src={selectedPage} 
                            onLoad={onImageLoad} 
                            onClick={handleImageClick}
                            className={`max-w-[80vw] max-h-[80vh] object-contain select-none block transition-opacity duration-300 ${mode === 'select' ? 'opacity-90' : 'opacity-100'}`} 
                          />
                        </ReactCrop>

                        {/* OCR Overlays: Dark Badges with Inline Buttons */}
                        {detectedCodes.map((item, idx) => (
                          <div 
                            key={idx}
                            className={`absolute z-30 group ${mode === 'select' ? 'pointer-events-auto' : 'pointer-events-none'}`}
                            style={{
                              left: `${item.left / scaleX}px`,
                              top: `${item.top / scaleY}px`,
                              width: `${item.width / scaleX}px`,
                              height: `${item.height / scaleY}px`,
                            }}
                          >
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center bg-gray-900/95 backdrop-blur text-white rounded-full pl-3 pr-1 py-1 shadow-2xl border border-gray-700/50 scale-90 group-hover:scale-100 transition-all duration-200 whitespace-nowrap ring-2 ring-white/10">
                              <span className="text-[10px] font-black tracking-tight mr-3 uppercase">{item.code}</span>
                              
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCopyCode(item.code); }}
                                  className={`p-1.5 rounded-full transition-all ${copiedCode === item.code ? 'bg-green-500 text-white' : 'hover:bg-gray-800 text-gray-400 hover:text-white'}`}
                                  title="Copy Code"
                                >
                                  {copiedCode === item.code ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                </button>

                                <button
                                  onClick={(e) => { e.stopPropagation(); handleManualCodeAssign(item.code); }}
                                  className={`p-1.5 rounded-full transition-all ${activeIndex === null ? 'opacity-20 cursor-not-allowed' : 'hover:bg-blue-600 text-gray-400 hover:text-white'}`}
                                  disabled={activeIndex === null}
                                  title="Assign to active filter"
                                >
                                  <MousePointer2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className={`w-full h-full border-2 rounded-sm pointer-events-none transition-all duration-300 ${copiedCode === item.code ? 'border-green-500 bg-green-500/10' : 'border-blue-400/30 group-hover:border-blue-500 group-hover:bg-blue-500/10'}`}></div>
                          </div>
                        ))}

                        {detectingCode && <div className="absolute inset-0 bg-white/20 backdrop-blur-[1px] flex items-center justify-center z-20"><div className="bg-white p-4 rounded-2xl shadow-2xl flex items-center gap-3"><Loader2 className="w-5 h-5 animate-spin text-[#a82b34]" /><span className="text-sm font-bold text-gray-700">Processing...</span></div></div>}
                      </div>
                    </div>
                  </div>
                  
                  {clickPos && (
                    <div 
                      className="fixed w-12 h-12 border-4 border-blue-500 rounded-full animate-ping pointer-events-none z-[100]"
                      style={{ left: clickPos.x - 24, top: clickPos.y - 24 }}
                    />
                  )}
                </div>
              </div>

              <div className="lg:col-span-1 flex flex-col min-h-0 gap-6">
                {/* Right Panel: Selected Filters */}
                <div className="flex flex-col min-h-0 h-1/2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-3"><div className="p-2 bg-red-50 rounded-lg"><Grid className="w-5 h-5 text-[#a82b34]" /></div>Selected</h3>
                    <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-1 rounded-full border border-gray-200 uppercase tracking-widest">{filters.length} ITEMS</span>
                  </div>
                  <div className="flex-1 overflow-auto pr-2 space-y-4 custom-scrollbar">
                    {filters.map((filter, i) => (
                      <div key={i} onClick={() => setActiveIndex(i)} className={`group bg-white p-4 rounded-2xl shadow-sm border transition-all duration-300 cursor-pointer ${activeIndex === i ? 'border-[#a82b34] ring-2 ring-[#a82b34]/10 scale-[1.02]' : 'border-gray-100 hover:border-gray-300'}`}>
                        <div className="flex flex-col gap-4">
                          <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                            <img src={filter.url} className="w-full h-full object-cover" />
                            {filter.code === 'UNKNOWN' && <div className="absolute top-2 right-2 bg-yellow-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-lg">Code Needed</div>}
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                               <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Detected Code</span>
                               {filter.code !== 'UNKNOWN' && <span className="flex items-center gap-1 text-[9px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded"><Check className="w-2.5 h-2.5" /> Auto-Detected</span>}
                            </div>
                            <input type="text" value={filter.code} onChange={(e) => { const n = [...filters]; n[i].code = e.target.value; setFilters(n); }} placeholder="e.g. WK160-17" className={`w-full px-4 py-2 bg-gray-50 border rounded-xl text-xs font-bold outline-none transition-all ${activeIndex === i ? 'border-[#a82b34]/50' : 'border-gray-200'}`} />
                            <div className="flex items-center gap-2">
                              {filter.isNew ? <button onClick={(e) => { e.stopPropagation(); handleSaveFilter(i); }} className="flex-1 bg-[#a82b34] hover:bg-[#8a222a] text-white py-2 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-100"><Save className="w-3 h-3" /> Save Changes</button>
                              : <button onClick={(e) => { e.stopPropagation(); handleSaveFilter(i); }} className="flex-1 bg-gray-900 hover:bg-black text-white py-2 rounded-xl text-[10px] font-bold flex items-center justify-center gap-2 transition-all"><Save className="w-3 h-3" /> Update Code</button>}
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteFilter(i); }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Panel: Detected Codes List */}
                <div className="flex-1 bg-white rounded-3xl shadow-md border border-gray-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-[#a82b34]" /> Detected Codes</h4>
                    <span className="text-[10px] font-bold bg-white text-gray-400 px-2 py-0.5 rounded-full border border-gray-200">{uniqueDetectedCodes.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-gray-50/20">
                    {uniqueDetectedCodes.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white border border-gray-100 p-2.5 rounded-xl hover:shadow-lg hover:border-blue-200 transition-all group scale-100 active:scale-[0.98]">
                        <span className="text-xs font-bold text-gray-700 tracking-tight">{item.code}</span>
                        <div className="flex gap-1.5">
                          <button 
                            onClick={() => handleCopyCode(item.code)} 
                            className={`p-1.5 rounded-lg transition-all ${copiedCode === item.code ? 'bg-green-500 text-white' : 'bg-gray-50 text-gray-400 hover:text-gray-900 hover:bg-gray-100'}`}
                            title="Copy Code"
                          >
                            {copiedCode === item.code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button 
                            onClick={() => handleManualCodeAssign(item.code)} 
                            disabled={activeIndex === null} 
                            className={`p-1.5 rounded-lg transition-all ${activeIndex === null ? 'opacity-20 cursor-not-allowed bg-gray-50 text-gray-300' : 'bg-blue-50 text-blue-500 hover:text-white hover:bg-blue-600 shadow-sm shadow-blue-100'}`}
                            title="Assign to Active Filter"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {uniqueDetectedCodes.length === 0 && !detectingCode && (
                      <div className="text-center py-10 opacity-40">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">No codes detected</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      {/* Library Section: Material Gallery */}
      <div className="mt-12 bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Material Library</h2>
            <p className="text-sm text-slate-500">Manage and review all extracted textures</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full uppercase tracking-wider">
              {filters.length} Items
            </span>
            <button 
              onClick={fetchFilters}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-600"
              title="Refresh Library"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-8">
          {filters.length === 0 ? (
            <div className="py-20 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-500 font-medium">Your library is empty. Start by cropping a PDF.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {filters.map((filter) => (
                <div 
                  key={filter.id} 
                  className="group relative bg-slate-50 rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all duration-300"
                >
                  <div className="aspect-[4/5] overflow-hidden bg-slate-200">
                    <img 
                      src={filter.url} 
                      alt={filter.code}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  </div>
                  
                  <div className="p-3 bg-white border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        {filter.code}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">
                      ID: {filter?.id?.toString()?.substring(0, 8) || 'PENDING'}...
                    </p>
                  </div>

                  {/* Actions Overlay */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => window.open(filter.url, '_blank')}
                      className="p-1.5 bg-white/90 backdrop-blur shadow-sm rounded-md text-slate-700 hover:text-indigo-600"
                      title="View Full Size"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
