
import { getUniversityInfo, UNIVERSITY_MAP } from "@/lib/university-config";
import { ChevronDown } from "lucide-react";

interface TeamSelectorProps {
  universities: string[];
  selectedTeam: string | null;
  onSelect: (univ: string | null) => void;
  title?: string;
}

export function TeamSelector({ universities, selectedTeam, onSelect, title = "Select Team" }: TeamSelectorProps) {
  const selectedInfo = selectedTeam ? getUniversityInfo(selectedTeam) : null;

  return (
    <div className="relative w-full">
      <select
        value={selectedTeam || ""}
        onChange={(e) => onSelect(e.target.value === "" ? null : e.target.value)}
        className="w-full appearance-none bg-card border border-border rounded-lg h-12 pl-4 pr-10 text-base font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-nzu-green/50"
      >
        <option value="" disabled>{title}</option>
        {universities.map(univ => {
          const info = getUniversityInfo(univ);
          return (
            <option key={univ} value={univ}>
              {info.logo} {info.name}
            </option>
          );
        })}
      </select>
      <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none">
        <ChevronDown className="h-5 w-5 text-muted-foreground" />
      </div>
      {selectedInfo && (
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <span className="text-xl">{selectedInfo.logo}</span>
        </div>
      )}
    </div>
  );
}
