// Copiado tal cual de ferreteria2: components/others/border-bottom-gradient.tsx
export default function BottomGradient() {
  return (
    <>
      <span className='absolute inset-x-[15%] -bottom-px block h-0.5 w-[70%] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100' />
      <span className='absolute inset-x-10 -bottom-px mx-auto block h-0.5 w-1/2 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100' />
    </>
  )
}
