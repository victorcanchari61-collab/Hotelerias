import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-6">
          Hotelerias Frontend
        </h1>
        
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              Contador con Tailwind CSS
            </p>
            <p className="text-4xl font-mono font-bold text-blue-600 dark:text-blue-400">
              {count}
            </p>
          </div>
          
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setCount(c => c - 1)}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              Decrementar
            </button>
            <button
              onClick={() => setCount(c => c + 1)}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              Incrementar
            </button>
          </div>

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
              ✓ React + Vite + Tailwind CSS v4 funcionando
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-1">
              Conectado a backend Go/Gin en localhost:8080
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App