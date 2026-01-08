import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Message templates based on PRD status mapping
const templates = [
  {
    etat: 'En cours',
    sousEtat: 'Dossier incomplet',
    sousEtat2: null,
    messageFr: 'Merci de ressaisir en complétant votre contrat',
    messageAr: 'يرجى إعادة تقديم المستندات',
    allowComplaint: false,
  },
  {
    etat: 'Fermé',
    sousEtat: null,
    sousEtat2: null,
    messageFr: 'Votre contrat a été installé ✅',
    messageAr: 'تم تثبيت عقدك ✅',
    allowComplaint: false,
  },
  {
    etat: 'En cours',
    sousEtat: 'Activation lancée',
    sousEtat2: null,
    messageFr: 'Votre contrat est toujours dans les délais, merci de patienter',
    messageAr: 'عقدك لا يزال ضمن المواعيد النهائية',
    allowComplaint: true,
  },
  {
    etat: 'En cours',
    sousEtat: 'BO fixe',
    sousEtat2: null,
    messageFr: 'Votre contrat est toujours dans les délais, merci de patienter',
    messageAr: 'عقدك لا يزال ضمن المواعيد النهائية',
    allowComplaint: true,
  },
  {
    etat: 'En cours',
    sousEtat: 'BO prestataire',
    sousEtat2: null,
    messageFr: 'Merci de vérifier que votre contrat a été envoyé à la validation',
    messageAr: 'يرجى التحقق من إرسال العقد',
    allowComplaint: true,
  },
  {
    etat: 'Refusé',
    sousEtat: 'Refusé par BO',
    sousEtat2: null,
    messageFr: 'Contrat refusé, resaisi',
    messageAr: 'العقد مرفوض',
    allowComplaint: false,
  },
  // Additional common statuses
  {
    etat: 'En cours',
    sousEtat: 'En attente',
    sousEtat2: null,
    messageFr: 'Votre contrat est en cours de traitement',
    messageAr: 'عقدك قيد المعالجة',
    allowComplaint: true,
  },
  {
    etat: 'En cours',
    sousEtat: 'Planifié',
    sousEtat2: null,
    messageFr: 'L\'installation de votre contrat est planifiée',
    messageAr: 'تم تحديد موعد لتثبيت عقدك',
    allowComplaint: true,
  },
  {
    etat: 'Annulé',
    sousEtat: null,
    sousEtat2: null,
    messageFr: 'Votre contrat a été annulé',
    messageAr: 'تم إلغاء عقدك',
    allowComplaint: false,
  },
];

// Admin users to seed
const adminUsers = [
  {
    email: 'admin@tktm.ma',
    name: 'Admin TKTM',
    role: 'admin',
    isActive: true,
  },
  {
    email: 'bo@tktm.ma',
    name: 'BO Team',
    role: 'bo_team',
    isActive: true,
  },
];

async function seed() {
  console.log('🌱 Starting database seed...');

  // Seed message templates
  console.log('📝 Seeding message templates...');
  for (const template of templates) {
    await prisma.messageTemplate.upsert({
      where: {
        etat_sousEtat_sousEtat2: {
          etat: template.etat,
          sousEtat: template.sousEtat,
          sousEtat2: template.sousEtat2,
        },
      },
      update: {
        messageFr: template.messageFr,
        messageAr: template.messageAr,
        allowComplaint: template.allowComplaint,
      },
      create: template,
    });
    console.log(`  ✓ Template: ${template.etat} / ${template.sousEtat || 'N/A'}`);
  }

  // Seed admin users
  console.log('👤 Seeding admin users...');
  for (const user of adminUsers) {
    await prisma.adminUser.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
      create: user,
    });
    console.log(`  ✓ User: ${user.email} (${user.role})`);
  }

  console.log('✅ Database seed completed!');
}

seed()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
