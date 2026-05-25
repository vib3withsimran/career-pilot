import express from 'express';
import fs from 'fs/promises';
import { verifyToken } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { enhanceSection } from '../services/ai/portfolioContentEnhancer.js';
import { extractAIProvider } from '../middleware/aiKey.js';
import { generateRobotsTxt, generateSitemapXml } from '../utils/sitemapGenerator.js';
import { analyzeAccessibility } from '../services/accessibilityChecker.js';
import mongoose from 'mongoose';
import PortfolioVersion from '../models/PortfolioVersion.model.js';
import UserProfile from '../models/UserProfile.model.js';
import { getObjectDiff, applyDiff } from '../utils/diff.js';

const router = express.Router();

const VALID_SECTIONS = ['hero', 'projects', 'about', 'skills'];
const VALID_SLUG_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/i;

const FREE_TIER_LIMIT_MB = 100;

const getPublicPortfolioBaseUrl = (req) => {
  const configuredBaseUrl = process.env.PORTFOLIO_BASE_URL || process.env.FRONTEND_URL;
  const fallbackBaseUrl = `${req.protocol}://${req.get('host')}`;
  return String(configuredBaseUrl || fallbackBaseUrl).replace(/\/$/, '');
};

const getApiBaseUrl = (req) => {
  return `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
};

const getPortfolioTemplatePath = (slug) => {
  return new URL(`../templates/portfolio/${slug}/index.html`, import.meta.url);
};

const assertValidPortfolioSlug = (slug) => {
  if (!VALID_SLUG_PATTERN.test(slug)) {
    throw new ApiError(400, 'Invalid portfolio slug.');
  }
};

// In-memory fallback for testing without a database
const inMemoryStore = new Map();

// Helper to reconstruct full state from versions
const reconstructVersion = async (portfolioId, targetVersionNumber, isConnected) => {
  if (isConnected) {
    const closestSnapshot = await PortfolioVersion.findOne({
      portfolioId,
      version: { $lte: targetVersionNumber },
      snapshot: { $ne: null }
    }).sort({ version: -1 });

    if (!closestSnapshot) return null;

    let content = closestSnapshot.snapshot;

    if (closestSnapshot.version < targetVersionNumber) {
      const intermediateDiffs = await PortfolioVersion.find({
        portfolioId,
        version: { $gt: closestSnapshot.version, $lte: targetVersionNumber }
      }).sort({ version: 1 });

      for (const v of intermediateDiffs) {
        if (v.changes) content = applyDiff(content, v.changes);
      }
    }
    return content;
  } else {
    const versions = inMemoryStore.get(portfolioId) || [];
    const targetVersions = versions.filter(v => v.version <= targetVersionNumber);
    if (targetVersions.length === 0) return null;

    // Find latest snapshot
    let snapshotIdx = -1;
    for (let i = targetVersions.length - 1; i >= 0; i--) {
      if (targetVersions[i].snapshot) {
        snapshotIdx = i;
        break;
      }
    }

    if (snapshotIdx === -1) return null;

    let content = targetVersions[snapshotIdx].snapshot;
    for (let i = snapshotIdx + 1; i < targetVersions.length; i++) {
      if (targetVersions[i].changes) {
        content = applyDiff(content, targetVersions[i].changes);
      }
    }
    return content;
  }
};

/**
 * POST /api/portfolio/:id/save
 */
router.post('/:id/save', verifyToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  // Authorization check (IDOR Protection)
  if (req.user.uid !== id) {
    throw new ApiError(403, 'Unauthorized access to this portfolio.');
  }

  if (!content) {
    throw new ApiError(400, 'Content is required for saving.');
  }

  const isConnected = mongoose.connection.readyState === 1;
  let latestVersion;

  if (isConnected) {
    latestVersion = await PortfolioVersion.findOne({ portfolioId: id }).sort({ version: -1 });
  } else {
    const portfolioVersions = inMemoryStore.get(id) || [];
    latestVersion = portfolioVersions[portfolioVersions.length - 1];
  }
  
  const newVersionNumber = (latestVersion?.version || 0) + 1;

  let changes = null;
  let snapshot = null;

  if (!latestVersion) {
    snapshot = content;
  } else {
    // Correctly reconstruct old content for diffing
    const oldContent = await reconstructVersion(id, latestVersion.version, isConnected) || {};
    changes = getObjectDiff(oldContent, content);
    
    if (!changes) {
      return res.status(200).json({
        success: true,
        message: 'No changes detected. Version not created.',
        version: latestVersion.version
      });
 * POST /api/portfolio/enhance-portfolio-content
 */
router.post(
  '/enhance-portfolio-content',
  verifyToken,
  extractAIProvider,
  asyncHandler(async (req, res) => {
    const { sectionType, content } = req.body;

    if (!sectionType || !content) {
      throw new ApiError(
        400,
        'sectionType and content are required.'
      );
    }

    // Every 10th version gets a full snapshot for efficiency
    if (newVersionNumber % 10 === 0) {
      snapshot = content;
    }
  }

  const versionData = {
    portfolioId: id,
    version: newVersionNumber,
    changes,
    snapshot,
    createdBy: req.user.uid,
  };

  if (isConnected) {
    try {
      await PortfolioVersion.create(versionData);
    } catch (error) {
      if (error.code === 11000) {
        throw new ApiError(409, 'A save request is already in progress. Please try again.');
      }
      throw error;
    }
    
    // Prune old versions (keep latest 50)
    if (newVersionNumber > 50) {
      const thresholdVersion = newVersionNumber - 50;
      
      // Ensure the new base version (thresholdVersion + 1) is a snapshot so it doesn't get orphaned
      const nextBaseVersion = await PortfolioVersion.findOne({
          portfolioId: id,
          version: thresholdVersion + 1
      });

      if (nextBaseVersion && !nextBaseVersion.snapshot) {
          const fullContent = await reconstructVersion(id, thresholdVersion + 1, true);
          await PortfolioVersion.updateOne(
              { _id: nextBaseVersion._id },
              { $set: { snapshot: fullContent, changes: null } }
          );
      }

      await PortfolioVersion.deleteMany({
        portfolioId: id,
        version: { $lte: thresholdVersion }
      });
    }
  } else {
    let portfolioVersions = inMemoryStore.get(id) || [];
    portfolioVersions.push({ _id: `mock-${Date.now()}`, ...versionData, createdAt: new Date() });
    if (portfolioVersions.length > 50) portfolioVersions.shift();
    inMemoryStore.set(id, portfolioVersions);
  }

    const result = await enhanceSection(
      sectionType,
      content,
      req.aiProvider
    );

    res.status(200).json({
      success: true,
      message:
        'Enhancement suggestion generated. Review before applying.',
      data: {
        sectionType: result.sectionType,
        before: result.original,
        after: result.enhanced,
        improvements: result.improvements,
      },
    });
  })
);

/**
 * POST /api/portfolio/:id/performance
 */
router.post(
  '/:id/performance',
  verifyToken,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const {
      htmlSizeKB,
      cssSizeKB,
      imageSizeMB,
      externalRequests,
      cssSelectors,
      fontStrategy,
    } = req.body;

    if (
      !htmlSizeKB &&
      !cssSizeKB &&
      !imageSizeMB
    ) {
      throw new ApiError(
        400,
        'Performance metrics payload is required.'
      );
    }

    res.status(200).json({
      success: true,
      message: `Performance metrics recorded for portfolio ${id}`,
      data: {
        portfolioId: id,
        receivedMetrics: {
          htmlSizeKB,
          cssSizeKB,
          imageSizeMB,
          externalRequests,
          cssSelectors,
          fontStrategy,
        },
      },
    });
  })
);

/**
 * GET /api/portfolio/public/:slug/sitemap.xml
 */
router.get(
  '/public/:slug/sitemap.xml',
  asyncHandler(async (req, res) => {
    const { slug } = req.params;

    assertValidPortfolioSlug(slug);

    let templateStat;

    try {
      templateStat = await fs.stat(
        getPortfolioTemplatePath(slug)
      );
    } catch {
      throw new ApiError(
        404,
        'Portfolio template not found.'
      );
    }

    const sitemapXml = generateSitemapXml({
      baseUrl: getPublicPortfolioBaseUrl(req),
      slug,
      portfolioPath: '/portfolio/public',
      portfolioUpdatedAt: templateStat.mtime,
    });

    res
      .status(200)
      .type('application/xml')
      .send(sitemapXml);
  })
);

/**
 * GET /api/portfolio/public/:slug/robots.txt
 */
router.get(
  '/public/:slug/robots.txt',
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    assertValidPortfolioSlug(slug);

    try {
      await fs.stat(getPortfolioTemplatePath(slug));
    } catch {
      throw new ApiError(404, 'Portfolio template not found.');
    }

    const sitemapUrl = `${getApiBaseUrl(req)}/api/portfolio/public/${encodeURIComponent(slug)}/sitemap.xml`;

    res
      .status(200)
      .type('text/plain')
      .send(generateRobotsTxt({ sitemapUrl }));
  })
);

/**
 * POST /api/portfolio/validate-token
 */
const TOKEN_VALIDATORS = {
  cloudflare: (token) => validateCloudflareToken(token),
  github: (token) => validateGithubToken(token),
  netlify: (token) => validateNetlifyToken(token),
};

router.post('/validate-token', verifyToken, asyncHandler(async (req, res) => {
  const { provider, token } = req.body ?? {};

  if (!provider || !TOKEN_VALIDATORS[provider]) {
    throw new ApiError(400, `provider must be one of: ${Object.keys(TOKEN_VALIDATORS).join(', ')}`);
  }

  const result = await TOKEN_VALIDATORS[provider](token);

  res.status(200).json({ success: true, provider, ...result });
}));

/**
 * GET /api/portfolio/:slug/bandwidth
 */
router.get('/:slug/bandwidth', asyncHandler(async (req, res) => {
  const { slug } = req.params;
  assertValidPortfolioSlug(slug);
  const templatePath = getPortfolioTemplatePath(slug);
  let html;
  try {
    html = await fs.readFile(templatePath, 'utf-8');
  } catch {
    throw new ApiError(404, 'Portfolio template not found.');
  }

  const estimatedPageSizeKB = 500;
  const monthlyViews = 1200;
  const bandwidthUsageMB = (estimatedPageSizeKB * monthlyViews) / 1024;
  const usagePercentage = (bandwidthUsageMB / FREE_TIER_LIMIT_MB) * 100;

  res.status(200).json({
    success: true,
    data: {
      slug,
      estimatedPageSizeKB,
      monthlyViews,
      bandwidthUsageMB: bandwidthUsageMB.toFixed(2),
      freeTierLimitMB: FREE_TIER_LIMIT_MB,
      usagePercentage: usagePercentage.toFixed(2),
      warning: usagePercentage >= 80,
    },
  });
}));

/**
 * GET /api/portfolio/public/:slug/accessibility
 */
router.get(
  '/public/:slug/accessibility',
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    assertValidPortfolioSlug(slug);
    const templatePath = getPortfolioTemplatePath(slug);
    let html;
    try {
      html = await fs.readFile(templatePath, 'utf-8');
    } catch {
      throw new ApiError(404, 'Portfolio template not found.');
    }
    const report = await analyzeAccessibility(html);
    res.status(200).json({
      success: true,
      slug,
      data: report,
    });
  })
);

/**
 * GET /api/portfolio
 * Returns a list of available portfolio template slugs.
 */
router.get('/', asyncHandler(async (req, res) => {
  const templatesDir = new URL('../templates/portfolio', import.meta.url);
  let slugs = [];
  try {
    const entries = await fs.readdir(templatesDir);
    slugs = entries.filter((e) => !e.startsWith('.'));
  } catch {
    slugs = [];
  }
  const portfolios = slugs.map((slug) => ({
    slug,
    url: `/portfolio/public/${slug}`,
  }));
  res.status(200).json({ success: true, portfolios, data: portfolios });
}));

export default router;
