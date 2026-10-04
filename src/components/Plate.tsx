/** Kennzeichen als Schild – mit dem blauen EU-Streifen, damit es im Gewimmel auffällt. */
export default function Plate({ plate }: { plate: string }) {
  return (
    <span className="inline-flex items-stretch rounded-md border-[1.5px] border-gray-900 bg-white overflow-hidden text-[13px] leading-tight font-extrabold tracking-wide text-gray-900 whitespace-nowrap">
      <span className="w-2 bg-[#1d4fa3]" aria-hidden="true" />
      <span className="px-2 py-0.5">{plate}</span>
    </span>
  )
}
