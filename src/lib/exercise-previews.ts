type ExercisePreviewInfo = { nameEn: string; alt: string };

const PREVIEWS: Record<string, ExercisePreviewInfo> = {
  REVERSE_LUNGE_TO_KNEE_DRIVE: {
    nameEn: "Reverse Lunge to Knee Drive",
    alt: "ก้าวขาข้างหนึ่งถอยหลังย่อตัวทำลันจ์ แล้วกลับขึ้นมายกเข่าข้างเดิมโดยยืนทรงตัวบนขาอีกข้าง",
  },
  BULGARIAN_SPLIT_SQUAT: {
    nameEn: "Bulgarian Split Squat",
    alt: "ท่าเริ่มและท่าย่อตัวของบัลแกเรียนสปลิตสควอต โดยวางเท้าหลังบนม้านั่ง",
  },
  SL_RDL: {
    nameEn: "Single Leg Romanian Deadlift",
    alt: "ยืนขาเดียวแล้วพับสะโพกไปข้างหน้า พร้อมเหยียดขาอีกข้างไปด้านหลัง",
  },
  WALKING_LUNGES: {
    nameEn: "Walking Lunges",
    alt: "ก้าวเท้าไปข้างหน้าแล้วลดเข่าหลังลงในท่าเดินลันจ์",
  },
  STEP_UPS: {
    nameEn: "Step Ups with Knee Drive",
    alt: "ยืนทรงตัวบนแท่นด้วยขาข้างหนึ่ง พร้อมยกเข่าอีกข้างขึ้น",
  },
  GLUTE_BRIDGE: {
    nameEn: "Glute Bridge",
    alt: "นอนหงายงอเข่า วางเท้าบนพื้น แล้วยกสะโพกขึ้น",
  },
  CLAMSHELL: {
    nameEn: "Clamshell",
    alt: "นอนตะแคงงอเข่า แล้วเปิดเข่าข้างบนโดยให้เท้าชิดกัน",
  },
  LATERAL_BAND_WALK: {
    nameEn: "Lateral Band Walk",
    alt: "ย่อเข่าเล็กน้อยแล้วก้าวด้านข้าง โดยมียางยืดรอบขาทั้งสอง",
  },
  STANDING_CALF_RAISE: {
    nameEn: "Standing Calf Raise",
    alt: "ยืนวางเท้าราบ แล้วเขย่งยกส้นเท้าทั้งสอง โดยปลายเท้ายังแตะพื้น",
  },
  SEATED_CALF_RAISE: {
    nameEn: "Seated Calf Raise",
    alt: "นั่งบนม้านั่งงอเข่า แล้วยกส้นเท้าโดยปลายเท้ายังแตะพื้น",
  },
  TIBIALIS_RAISE: {
    nameEn: "Tibialis Raise",
    alt: "ยืนพิงผนังแล้วกระดกปลายเท้าขึ้น โดยส้นเท้ายังแตะพื้น",
  },
  PLANK: {
    nameEn: "Forearm Plank",
    alt: "วางท่อนแขนบนเสื่อ แล้วเหยียดขาเป็นแพลงก์ โดยลำตัวเป็นแนวตรง",
  },
  SIDE_PLANK: {
    nameEn: "Side Plank",
    alt: "วางท่อนแขนข้างหนึ่งบนเสื่อแล้วรับน้ำหนักในท่าแพลงก์ด้านข้าง",
  },
  DEAD_BUG: {
    nameEn: "Dead Bug",
    alt: "นอนหงายยกแขนและงอเข่า แล้วเหยียดแขนกับขาฝั่งตรงข้ามในท่าเดดบัก",
  },
  BIRD_DOG: {
    nameEn: "Bird Dog",
    alt: "จากท่าคลาน เหยียดแขนกับขาฝั่งตรงข้ามโดยลำตัวอยู่แนวตรง",
  },
  SINGLE_ARM_DUMBBELL_ROW: {
    nameEn: "Single-Arm Dumbbell Row",
    alt: "ใช้มือและเข่าข้างหนึ่งพยุงบนม้านั่ง แล้วดึงดัมเบลด้วยแขนอีกข้างขึ้นใกล้ลำตัว",
  },
};

export function getExercisePreview(code: string) {
  const preview = PREVIEWS[code];
  if (!preview) return null;
  return {
    ...preview,
    src: `/exercises/${code.toLowerCase().replaceAll("_", "-")}.webp`,
  };
}
