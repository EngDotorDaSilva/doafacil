import { z } from 'zod';
import { DonationRequest } from '../models/DonationRequest.js';
import { Item } from '../models/Item.js';
import { Center } from '../models/Center.js';

export class DonationController {
  static async create(req, res, io) {
    const schema = z
      .object({
        itemId: z.number().int().positive(),
        message: z.string().optional()
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    const item = await Item.findById(parsed.data.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.status !== 'available') {
      return res.status(400).json({ error: 'Item is not available' });
    }

    const center = await Center.findById(item.centerId);
    if (!center || !center.approved) {
      return res.status(400).json({ error: 'Center not approved' });
    }

    const request = await DonationRequest.create({
      itemId: item.id,
      donorUserId: req.auth.userId,
      centerId: item.centerId,
      message: parsed.data.message
    });

    // Notify center via Socket.IO
    if (io) {
      const requestWithDetails = await DonationRequest.findById(request.id);
      io.to(`user:${center.userId}`).emit('donation:request:new', { request: requestWithDetails });
    }

    return res.json({ request });
  }

  static async getMine(req, res) {
    const status = req.query.status ? String(req.query.status) : null;
    const requests = await DonationRequest.findByDonorId(req.auth.userId, status);
    
    // Calculate statistics
    const allRequests = await DonationRequest.findByDonorId(req.auth.userId, null);
    const stats = {
      total: allRequests.length,
      pending: allRequests.filter((r) => r.status === 'pending').length,
      accepted: allRequests.filter((r) => r.status === 'accepted').length,
      completed: allRequests.filter((r) => r.status === 'completed').length,
      cancelled: allRequests.filter((r) => r.status === 'cancelled').length
    };
    
    return res.json({ requests, stats });
  }

  static async getCenterRequests(req, res) {
    const center = await Center.findByUserId(req.auth.userId);
    if (!center) return res.status(404).json({ error: 'Center not found' });

    const status = req.query.status ? String(req.query.status) : null;
    const requests = await DonationRequest.findByCenterId(center.id, status);
    
    // Calculate statistics
    const allRequests = await DonationRequest.findByCenterId(center.id, null);
    const stats = {
      total: allRequests.length,
      pending: allRequests.filter((r) => r.status === 'pending').length,
      accepted: allRequests.filter((r) => r.status === 'accepted').length,
      completed: allRequests.filter((r) => r.status === 'completed').length,
      cancelled: allRequests.filter((r) => r.status === 'cancelled').length
    };
    
    return res.json({ requests, stats });
  }

  static async updateStatus(req, res, io) {
    const id = Number(req.params.id);
    const schema = z
      .object({
        status: z.enum(['pending', 'accepted', 'completed', 'cancelled'])
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    const request = await DonationRequest.findById(id);
    if (!request) return res.status(404).json({ error: 'Not found' });

    // Check permissions
    const center = await Center.findByUserId(req.auth.userId);
    const isCenter = center && request.centerId === center.id;
    const isDonor = request.donorUserId === req.auth.userId;

    if (!isCenter && !isDonor) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Only center can accept, both can cancel/complete
    if (parsed.data.status === 'accepted' && !isCenter) {
      return res.status(403).json({ error: 'Only center can accept requests' });
    }

    // Don't allow changing from completed or cancelled
    if (request.status === 'completed' || request.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot change status of completed or cancelled requests' });
    }

    const updated = await DonationRequest.updateStatus(id, parsed.data.status);

    // Update item status if completed
    if (parsed.data.status === 'completed') {
      await Item.update(request.itemId, { status: 'donated' });
    } else if (parsed.data.status === 'accepted') {
      // Mark item as unavailable when accepted
      await Item.update(request.itemId, { status: 'unavailable' });
    }

    // Notify via Socket.IO
    if (io) {
      const requestWithDetails = await DonationRequest.findById(id);
      if (isCenter) {
        // Notify donor
        io.to(`user:${request.donorUserId}`).emit('donation:request:updated', { request: requestWithDetails });
      } else {
        // Notify center
        const centerData = await Center.findById(request.centerId);
        if (centerData) {
          io.to(`user:${centerData.userId}`).emit('donation:request:updated', { request: requestWithDetails });
        }
      }
    }

    return res.json({ request: updated });
  }

  static async delete(req, res) {
    const id = Number(req.params.id);
    const request = await DonationRequest.findById(id);
    if (!request) return res.status(404).json({ error: 'Not found' });

    // Only donor can delete their own pending requests
    if (request.donorUserId !== req.auth.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Can only delete pending requests' });
    }

    await DonationRequest.delete(id);
    return res.json({ ok: true });
  }
}
