import { Router, Response } from 'express';
import { requireClerkAuth, ClerkAuthRequest } from '../middleware/requireClerkAuth';
import { prisma } from '../db';

const router = Router();

// Get user profile
router.get('/profile', requireClerkAuth, async (req: ClerkAuthRequest, res: Response) => {
  try {
    const userId = req.clerkUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: {
        recruiterProfile: true,
        candidateProfile: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update user profile
router.post('/profile', requireClerkAuth, async (req: ClerkAuthRequest, res: Response) => {
  try {
    const userId = req.clerkUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { email, role } = req.body;

    const user = await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        email,
        role
      },
      create: {
        clerkId: userId,
        email,
        role
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Error creating/updating user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create job posting (recruiter only)
router.post('/jobs', requireClerkAuth, async (req: ClerkAuthRequest, res: Response) => {
  try {
    const userId = req.clerkUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { recruiterProfile: true }
    });

    if (!user || user.role !== 'RECRUITER' || !user.recruiterProfile) {
      return res.status(403).json({ error: 'Access denied. Recruiter profile required.' });
    }

    const {
      title,
      description,
      location,
      type,
      interviewContext,
      interviewEndDate,
      screenshotInterval
    } = req.body;

    const job = await prisma.job.create({
      data: {
        title,
        description,
        location,
        type,
        recruiterId: user.recruiterProfile.id,
        interviewContext: interviewContext || '',
        interviewEndDate: interviewEndDate ? new Date(interviewEndDate) : null,
        screenshotInterval: screenshotInterval || 30
      }
    });

    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all jobs
router.get('/jobs', async (req: ClerkAuthRequest, res: Response) => {
  try {
    const jobs = await prisma.job.findMany({
      include: {
        recruiter: {
          include: {
            user: {
              select: {
                email: true
              }
            }
          }
        },
        _count: {
          select: {
            applications: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific job
router.get('/jobs/:id', async (req: ClerkAuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        recruiter: {
          include: {
            user: {
              select: {
                email: true
              }
            }
          }
        }
      }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Apply to job (candidate only)
router.post('/jobs/:id/apply', requireClerkAuth, async (req: ClerkAuthRequest, res: Response) => {
  try {
    const userId = req.clerkUserId;
    const { id: jobId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { candidateProfile: true }
    });

    if (!user || user.role !== 'CANDIDATE' || !user.candidateProfile) {
      return res.status(403).json({ error: 'Access denied. Candidate profile required.' });
    }

    // Check if already applied
    const existingApplication = await prisma.application.findFirst({
      where: {
        jobId,
        candidateId: user.candidateProfile.id
      }
    });

    if (existingApplication) {
      return res.status(409).json({ error: 'Already applied to this job' });
    }

    const application = await prisma.application.create({
      data: {
        jobId,
        candidateId: user.candidateProfile.id,
        status: 'PENDING'
      }
    });

    res.status(201).json(application);
  } catch (error) {
    console.error('Error applying to job:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's applications (candidate only)
router.get('/applications', requireClerkAuth, async (req: ClerkAuthRequest, res: Response) => {
  try {
    const userId = req.clerkUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { candidateProfile: true }
    });

    if (!user || user.role !== 'CANDIDATE' || !user.candidateProfile) {
      return res.status(403).json({ error: 'Access denied. Candidate profile required.' });
    }

    const applications = await prisma.application.findMany({
      where: {
        candidateId: user.candidateProfile.id
      },
      include: {
        job: {
          include: {
            recruiter: {
              include: {
                user: {
                  select: {
                    email: true
                  }
                }
              }
            }
          }
        },
        interview: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(applications);
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recruiter's job applications
router.get('/recruiter/applications', requireClerkAuth, async (req: ClerkAuthRequest, res: Response) => {
  try {
    const userId = req.clerkUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { recruiterProfile: true }
    });

    if (!user || user.role !== 'RECRUITER' || !user.recruiterProfile) {
      return res.status(403).json({ error: 'Access denied. Recruiter profile required.' });
    }

    const applications = await prisma.application.findMany({
      where: {
        job: {
          recruiterId: user.recruiterProfile.id
        }
      },
      include: {
        job: true,
        candidate: {
          include: {
            user: {
              select: {
                email: true
              }
            }
          }
        },
        interview: {
          include: {
            score: true,
            recordings: true,
            screenshots: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(applications);
  } catch (error) {
    console.error('Error fetching recruiter applications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
