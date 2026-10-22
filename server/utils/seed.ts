import { User } from '../models/User.js';
import { Content } from '../models/Content.js';

export async function seedInitialData(): Promise<void> {
  try {
    // 1. Production Mode: Never seed predictable demo credentials or dummy content
    if (process.env.NODE_ENV === 'production') {
      const existingAdmin = await User.findOne({ role: 'ADMIN' });
      if (existingAdmin) {
        console.log('[Security] Verified existing administrator account.');
        return;
      }

      const adminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
      const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
      const adminName = process.env.INITIAL_ADMIN_NAME?.trim() || 'Platform Administrator';

      if (adminEmail && adminPassword) {
        // Enforce basic security standards for bootstrap admin
        if (adminPassword.length < 12) {
          console.warn(
            '[Security] INITIAL_ADMIN_PASSWORD must be at least 12 characters long. Administrator account not created.'
          );
          return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(adminEmail)) {
          console.warn(
            '[Security] INITIAL_ADMIN_EMAIL is not a valid email address. Administrator account not created.'
          );
          return;
        }

        const existingUser = await User.findOne({ email: adminEmail });
        if (existingUser) {
          console.warn(
            `[Security] User with email ${adminEmail} already exists as a non-admin account. ` +
            'Cannot promote existing non-admin user or overwrite password during bootstrap. Provisioning aborted.'
          );
          return;
        }

        await User.create({
          name: adminName,
          email: adminEmail,
          password: adminPassword, // Hashed by User pre('save') hook
          role: 'ADMIN',
          status: 'active',
          bio: 'Platform System Administrator',
        });
        console.log(`[Security] Successfully provisioned initial administrator for ${adminEmail}.`);
      } else {
        console.warn(
          '[Security] No administrator account found. To provision the initial administrator, ' +
          'set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (minimum 12 characters) in environment variables.'
        );
      }
      return;
    }

    // 2. Non-Production Mode: Seed local demo accounts and content for development
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return; // Already seeded
    }

    console.log('Seeding initial default demo accounts and creator content...');

    // Create Admin User
    const adminUser = await User.create({
      name: 'Platform Admin',
      email: 'admin@aicreatorhub.com',
      password: 'adminpassword123',
      role: 'ADMIN',
      status: 'active',
      bio: 'Lead System Administrator for AI CreatorHub.',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
    });

    // Create Demo Creator User
    const demoUser = await User.create({
      name: 'Alex Vance',
      email: 'creator@aicreatorhub.com',
      password: 'creatorpassword123',
      role: 'USER',
      status: 'active',
      bio: 'Tech Content Creator & Tech Reviewer. Sharing daily insights on AI, web dev, and digital tools.',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250',
      socialHandles: {
        twitter: '@alexvance_tech',
        youtube: 'AlexVanceTech',
        instagram: '@alexvance.creator',
        linkedin: 'alexvance-tech',
      },
    });

    // Create Sample Creator Posts
    await Content.create([
      {
        userId: demoUser._id,
        title: 'Top 5 AI Tools Revolutionizing Content Creation in 2026',
        body: `Content creation is evolving rapidly with AI tools. In this guide, we break down the top 5 tools every creator needs in their workflow:\n\n1. AI Script Generators - Boost ideation efficiency.\n2. Automated Voiceovers - Studio quality audio in seconds.\n3. Smart Video Clipping - Auto-detect highlight moments.\n4. AI Captioning & Hashtags - Optimize social reach.\n5. Automated Analytics Dashboards - Real-time audience metrics.`,
        category: 'Blog Post',
        tags: ['AI', 'ContentCreation', 'Tech2026', 'CreatorEconomy'],
        status: 'published',
        platform: 'Blog',
        publishedAt: new Date(),
        aiCaptions: [
          '🚀 5 AI tools that will save you 15+ hours a week as a creator! #AI #ContentCreator',
          'Stop working harder—start creating smarter. Here are 5 AI tools changing the game in 2026 💡',
        ],
      },
      {
        userId: demoUser._id,
        title: 'Building a Full-Stack Creator App with Express, React & Gemini AI',
        body: `Step-by-step breakdown of architectural best practices when building AI-powered web applications. We discuss JWT auth, prompt injection defense, Mongoose schema design, and function calling.`,
        category: 'Social Media',
        tags: ['WebDev', 'ExpressJS', 'React', 'GeminiAI'],
        status: 'published',
        platform: 'LinkedIn',
        publishedAt: new Date(),
        aiCaptions: [
          'Full-stack architecture matters when embedding LLMs! Check out our security blueprint 🔒 #SoftwareEngineering',
        ],
      },
      {
        userId: demoUser._id,
        title: 'Weekly Creator Newsletter #42: Hooking Your Audience in 3 Seconds',
        body: `The first 3 seconds of any video or post determine whether a scroll turns into a view. Here is our breakdown of 3 viral hook formulas:\n- The Contrarian Hook: "Everything you knew about X is wrong."\n- The Curiosity Gap: "This 1 mistake is costing you 1,000 followers."\n- The Visual Transformation: "Before vs After using this tool."`,
        category: 'Newsletter',
        tags: ['Newsletter', 'GrowthHacks', 'Copywriting'],
        status: 'draft',
        platform: 'General',
        aiCaptions: [
          'Mastering the first 3 seconds of content! Read newsletter #42 📬 #CreatorTips',
        ],
      },
    ]);

    console.log('Database seeding complete.');
    console.log('Demo Accounts Available:');
    console.log('  Admin: admin@aicreatorhub.com / adminpassword123');
    console.log('  User:  creator@aicreatorhub.com / creatorpassword123');
  } catch (error) {
    console.error('Error seeding initial database data:', error);
  }
}
