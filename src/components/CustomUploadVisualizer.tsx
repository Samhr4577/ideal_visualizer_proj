import { useState, useEffect, useRef } from 'react'

export default function CustomUploadVisualizer({ onBack, onLogout, userName }: { onBack: () => void, onLogout?: () => void, userName?: string }) {
  const [wallImage, setWallImage] = useState<File | null>(null)
  const [wallPreview, setWallPreview] = useState<string | null>(null)
  
  const [extractedTextures, setExtractedTextures] = useState<any[]>([])
  const [selectedTextureUrl, setSelectedTextureUrl] = useState<string | null>(null)
  const [customTextureFile, setCustomTextureFile] = useState<File | null>(null)
  const [customTexturePreview, setCustomTexturePreview] = useState<string | null>(null)
  
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [isDragging, setIsDragging] = useState(false)
  const [compareMode, setCompareMode] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)

  const handleSaveDesign = () => {
    if (!resultImage) {
      setError('No design to save yet. Please apply a material first.')
      return
    }
    setShowSaveModal(true)
  }

  const handleDownload = async () => {
    if (!resultImage) return;
    try {
      const response = await fetch(resultImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `room_design_${new Date().getTime()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download image", err);
      // Fallback
      window.open(resultImage, '_blank');
    }
  }

  // Real coordinate sent to backend
  const [clickPoint, setClickPoint] = useState<{x: number, y: number} | null>(null)
  // Percentage coordinate for frontend dot display
  const [visualClick, setVisualClick] = useState<{x: number, y: number} | null>(null)

  const imageRef = useRef<HTMLImageElement>(null)

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

  const executeProcess = async (wImage: File, cTexture: File | null, sUrl: string | null, cx?: number, cy?: number) => {
    if (!wImage || (!cTexture && !sUrl)) return

    setProcessing(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('wall_image', wImage)
      if (cTexture) {
        formData.append('texture_image', cTexture)
      } else if (sUrl) {
        formData.append('texture_url', sUrl)
      }
      
      const x = cx !== undefined ? cx : clickPoint?.x
      const y = cy !== undefined ? cy : clickPoint?.y
      
      if (x !== undefined && y !== undefined) {
        formData.append('click_x', x.toString())
        formData.append('click_y', y.toString())
      }

      const response = await fetch('http://localhost:5000/api/process-wall', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to process image')

      setResultImage(data.resultUrl)
      setCompareMode(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  const handleWallDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleWallSelect(e.dataTransfer.files[0])
    }
  }

  const handleWallSelect = (file: File) => {
    setWallImage(file)
    setWallPreview(URL.createObjectURL(file))
    setResultImage(null)
    setClickPoint(null)
    setVisualClick(null)
    setCompareMode(false)
  }

  const handleTextureSelect = (url: string) => {
    setSelectedTextureUrl(url)
    setCustomTextureFile(null)
    setCustomTexturePreview(null)
    if (wallImage) {
      executeProcess(wallImage, null, url)
    }
  }

  const handleCustomTextureSelect = (file: File) => {
    setCustomTextureFile(file)
    setCustomTexturePreview(URL.createObjectURL(file))
    setSelectedTextureUrl(null)
    if (wallImage) {
      executeProcess(wallImage, file, null)
    }
  }

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current || !wallImage) return
    const rect = imageRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const naturalWidth = imageRef.current.naturalWidth
    const naturalHeight = imageRef.current.naturalHeight
    
    const scaleX = naturalWidth / rect.width
    const scaleY = naturalHeight / rect.height
    
    const realX = Math.round(x * scaleX)
    const realY = Math.round(y * scaleY)
    
    setClickPoint({x: realX, y: realY})
    setVisualClick({x: (x / rect.width) * 100, y: (y / rect.height) * 100})
    
    if (customTextureFile || selectedTextureUrl) {
      executeProcess(wallImage, customTextureFile, selectedTextureUrl, realX, realY)
    }
  }

  const handleReset = () => {
    setResultImage(null)
    setSelectedTextureUrl(null)
    setCustomTextureFile(null)
    setCustomTexturePreview(null)
    setClickPoint(null)
    setVisualClick(null)
  }

  // Generate unique categories for the mock display
  const getTextureCategory = (index: number) => {
    return index % 3 === 0 ? "Wallpaper" : index % 2 === 0 ? "Paint" : "Tile"
  }

  return (
    <div className="h-screen bg-[#f8f9fa] flex flex-col font-sans overflow-hidden">
      <header className="bg-white border-b border-gray-200 h-16 flex items-center px-6 shrink-0 z-20 shadow-sm justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Exit Visualizer
        </button>
        <div className="font-bold text-lg text-gray-800 tracking-tight flex items-center gap-2">
          Studio Editor
        </div>
        <div className="flex items-center justify-end gap-6">
          {wallPreview && (
            <label className="text-sm font-medium text-gray-900 hover:text-gray-600 cursor-pointer transition-colors bg-gray-100 px-4 py-1.5 rounded-md hover:bg-gray-200">
              Change Photo
              <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                if (e.target.files?.[0]) handleWallSelect(e.target.files[0])
              }} />
            </label>
          )}
          <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
            {userName ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 font-bold text-sm shadow-inner uppercase">
                  {userName.charAt(0)}
                </div>
                <span className="text-sm font-semibold text-gray-700 hidden sm:block">{userName}</span>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm shadow-inner">
                U
              </div>
            )}
            {onLogout && (
              <button onClick={onLogout} className="text-sm text-gray-500 hover:text-red-600 transition-colors font-medium ml-2">
                Logout
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar Textures */}
        <aside className="w-[320px] bg-white border-r border-gray-200 shrink-0 flex flex-col z-10 shadow-[2px_0_15px_rgba(0,0,0,0.02)]">
          <div className="p-5 border-b border-gray-100 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Material Library</h3>
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">{extractedTextures.length} Items</span>
            </div>
            <label className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-4 py-3 rounded-xl cursor-pointer transition-all shadow-sm active:scale-[0.98]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              Upload Custom Material
              <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                if (e.target.files?.[0]) handleCustomTextureSelect(e.target.files[0])
              }} />
            </label>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
            {customTexturePreview && (
              <div className="bg-white rounded-2xl p-2.5 cursor-pointer transition-all ring-2 ring-gray-900 shadow-md">
                <div className="aspect-[4/3] rounded-xl overflow-hidden mb-3 bg-gray-100">
                  <img src={customTexturePreview} className="w-full h-full object-cover" />
                </div>
                <div className="px-1 pb-1">
                  <p className="font-bold text-sm text-gray-900 truncate">Custom Upload</p>
                  <p className="text-xs text-gray-500 mt-0.5">Your File</p>
                </div>
              </div>
            )}
            
            {extractedTextures.map((tex, i) => {
              const isSelected = selectedTextureUrl === tex.url
              return (
                <div 
                  key={tex.id}
                  onClick={() => handleTextureSelect(tex.url)}
                  className={`bg-white rounded-2xl p-2.5 cursor-pointer transition-all duration-200 group ${isSelected ? 'ring-2 ring-gray-900 shadow-md scale-[0.98]' : 'hover:shadow-lg border border-gray-100 hover:border-gray-300'}`}
                >
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-3 bg-gray-100">
                    <img src={tex.url} className={`w-full h-full object-cover transition-transform duration-700 ${isSelected ? '' : 'group-hover:scale-110'}`} />
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-gray-900 text-white rounded-full p-1.5 shadow-sm">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                    )}
                  </div>
                  <div className="px-1 pb-1 flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-gray-900 truncate">{tex.name || `Material ${i+1}`}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{getTextureCategory(i)}</p>
                    </div>
                    <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100 shrink-0">#{tex.id.slice(0,4)}</span>
                  </div>
                </div>
              )
            })}
            
            {extractedTextures.length === 0 && !customTexturePreview && (
              <div className="text-center py-16 px-4 text-gray-400 text-sm bg-white rounded-2xl border border-dashed border-gray-200">
                <svg className="w-10 h-10 mx-auto mb-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                No materials available in the catalog yet.
              </div>
            )}
          </div>
        </aside>

        {/* Main Center Area */}
        <main className="flex-1 flex flex-col relative bg-[#f1f3f5]">
          
          {error && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-900/95 backdrop-blur text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-4 z-50 animate-in fade-in slide-in-from-top-4 border border-red-800">
              <span className="text-sm font-medium">{error}</span>
              <button onClick={() => setError(null)} className="text-red-200 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          <div className="flex-1 p-8 flex items-center justify-center relative overflow-hidden">
            {wallPreview ? (
              <div className="relative inline-flex max-w-full max-h-full rounded-xl shadow-2xl overflow-hidden bg-white ring-1 ring-black/5 group">
                <img 
                  ref={imageRef}
                  src={compareMode ? wallPreview : (resultImage || wallPreview)} 
                  className={`max-w-full max-h-[calc(100vh-14rem)] object-contain cursor-crosshair transition-opacity duration-300 ${processing ? 'opacity-60 blur-[1px]' : 'opacity-100'}`}
                  onClick={handleImageClick}
                  alt="Wall preview"
                />
                
                {/* Visual Click Indicator */}
                {visualClick && !compareMode && (
                  <div 
                    className="absolute w-6 h-6 -ml-3 -mt-3 pointer-events-none z-10 flex items-center justify-center transition-all duration-300"
                    style={{ left: `${visualClick.x}%`, top: `${visualClick.y}%` }}
                  >
                    <div className="absolute inset-0 bg-white/30 rounded-full animate-ping"></div>
                    <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_12px_rgba(0,0,0,0.6)] border-2 border-gray-900"></div>
                    <div className="absolute top-full mt-2 bg-gray-900/90 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap opacity-80 group-hover:opacity-100 transition-opacity">
                      Target Area
                    </div>
                  </div>
                )}

                {processing && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/5">
                    <div className="bg-white/95 backdrop-blur-md px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4">
                      <div className="relative flex h-6 w-6">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-900 opacity-20"></span>
                        <span className="relative inline-flex rounded-full h-6 w-6 bg-gray-900 items-center justify-center">
                           <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </span>
                      </div>
                      <span className="font-bold text-gray-900 text-sm tracking-wide">Processing Wall...</span>
                    </div>
                  </div>
                )}
                
                {!resultImage && !processing && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/5">
                    <div className="bg-gray-900/90 backdrop-blur text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-xl flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                      Click to set target area
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div 
                className={`w-full max-w-2xl aspect-[16/10] border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all duration-300 ${isDragging ? 'border-gray-900 bg-gray-100 scale-[1.02]' : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 shadow-sm'}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleWallDrop}
              >
                <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6 shadow-inner border border-gray-100">
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Upload your space</h3>
                <p className="text-gray-500 mb-8 max-w-md text-center leading-relaxed">Drag and drop a high-quality photo of your room, or browse your files to begin visualizing.</p>
                <label className="bg-gray-900 text-white px-8 py-3.5 rounded-xl font-bold cursor-pointer hover:bg-gray-800 shadow-lg hover:shadow-xl transition-all active:scale-95">
                  Browse Files
                  <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                    if (e.target.files?.[0]) handleWallSelect(e.target.files[0])
                  }} />
                </label>
              </div>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="h-20 bg-white border-t border-gray-200 flex items-center px-8 justify-between shrink-0 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
            <div className="flex gap-4">
              <button 
                onClick={handleReset}
                disabled={!wallPreview}
                className="px-6 py-2.5 rounded-xl font-medium text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Reset Canvas
              </button>
            </div>
            
            <div className="flex items-center gap-8">
              {resultImage && (
                <label className="flex items-center gap-3 cursor-pointer group">
                  <span className={`text-sm font-semibold transition-colors ${compareMode ? 'text-gray-900' : 'text-gray-400'}`}>Original</span>
                  <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 transition-colors group-hover:bg-gray-300">
                    <input type="checkbox" className="sr-only" checked={!compareMode} onChange={() => setCompareMode(!compareMode)} />
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${!compareMode ? 'translate-x-6 bg-gray-900 shadow-md' : 'translate-x-1'}`} />
                  </div>
                  <span className={`text-sm font-semibold transition-colors ${!compareMode ? 'text-gray-900' : 'text-gray-400'}`}>Rendered</span>
                </label>
              )}
              
              <button 
                onClick={handleSaveDesign}
                className="bg-gray-900 text-white px-8 py-2.5 rounded-xl font-bold shadow-md hover:bg-gray-800 transition-all hover:shadow-lg active:scale-95"
              >
                Save & View Design
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Save Modal Overlay */}
      {showSaveModal && resultImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col md:flex-row relative">
            <button 
              onClick={() => setShowSaveModal(false)}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/50 backdrop-blur hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <div className="w-full md:w-1/2 bg-gray-100 flex items-center justify-center p-8 relative">
               <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '16px 16px'}}></div>
               <img src={resultImage} alt="Saved Design" className="relative z-10 max-w-full max-h-[60vh] object-contain rounded-xl shadow-lg ring-1 ring-black/5" />
            </div>
            
            <div className="w-full md:w-1/2 p-8 sm:p-12 flex flex-col justify-center">
              <div className="w-14 h-14 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-green-200">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h2 className="text-3xl font-extrabold text-gray-900 mb-3 tracking-tight">Design saved successfully!</h2>
              <p className="text-gray-500 mb-8 leading-relaxed text-lg">Your beautiful new room design has been saved. You can download a high-quality copy to share with contractors, friends, or family.</p>
              
              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleDownload}
                  className="bg-gray-900 text-white text-center px-6 py-4 rounded-xl font-bold text-lg hover:bg-gray-800 transition-all shadow-md active:scale-[0.98] flex justify-center items-center gap-3"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Download Image
                </button>
                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="bg-white border-2 border-gray-200 text-gray-900 text-center px-6 py-4 rounded-xl font-bold text-lg hover:border-gray-900 hover:bg-gray-50 transition-all active:scale-[0.98]"
                >
                  Continue Editing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
