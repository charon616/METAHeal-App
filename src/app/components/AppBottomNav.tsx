import React from "react";
import { CalendarDays, CircleUserRound, Footprints, Stethoscope } from "lucide-react";

type PatientTab = "today" | "booking" | "mypage";
type DoctorTab = "overview" | "patients" | "booking";

type AppBottomNavProps = {
  mode: "patient" | "doctor";
  patientTab: PatientTab;
  doctorTab: DoctorTab;
  onPatientTabChange: (tab: PatientTab) => void;
  onDoctorTabChange: (tab: DoctorTab) => void;
};

type NavButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: any;
};

function NavButton({ label, active, onClick, icon }: NavButtonProps) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1">
      <div className={`rounded-xl p-2 ${active ? "bg-black" : "bg-transparent"}`}>{icon}</div>
      <span className={`text-[10px] font-semibold ${active ? "text-black" : "text-gray-400"}`}>{label}</span>
    </button>
  );
}

export default function AppBottomNav({
  mode,
  patientTab,
  doctorTab,
  onPatientTabChange,
  onDoctorTabChange,
}: AppBottomNavProps) {
  if (mode === "patient") {
    return (
      <div className="flex items-center justify-around">
        <NavButton
          label="Today"
          active={patientTab === "today"}
          onClick={() => onPatientTabChange("today")}
          icon={<Footprints size={18} color={patientTab === "today" ? "#fff" : "#b9b9b9"} />}
        />
        <NavButton
          label="Booking"
          active={patientTab === "booking"}
          onClick={() => onPatientTabChange("booking")}
          icon={<CalendarDays size={18} color={patientTab === "booking" ? "#fff" : "#b9b9b9"} />}
        />
        <NavButton
          label="My Page"
          active={patientTab === "mypage"}
          onClick={() => onPatientTabChange("mypage")}
          icon={<CircleUserRound size={18} color={patientTab === "mypage" ? "#fff" : "#b9b9b9"} />}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-around">
      <NavButton
        label="Overview"
        active={doctorTab === "overview"}
        onClick={() => onDoctorTabChange("overview")}
        icon={<Stethoscope size={18} color={doctorTab === "overview" ? "#fff" : "#b9b9b9"} />}
      />
      <NavButton
        label="Patients"
        active={doctorTab === "patients"}
        onClick={() => onDoctorTabChange("patients")}
        icon={<CircleUserRound size={18} color={doctorTab === "patients" ? "#fff" : "#b9b9b9"} />}
      />
      <NavButton
        label="Booking"
        active={doctorTab === "booking"}
        onClick={() => onDoctorTabChange("booking")}
        icon={<CalendarDays size={18} color={doctorTab === "booking" ? "#fff" : "#b9b9b9"} />}
      />
    </div>
  );
}
