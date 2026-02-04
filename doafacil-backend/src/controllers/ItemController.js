import { z } from 'zod';
import { Item } from '../models/Item.js';
import { Center } from '../models/Center.js';

export class ItemController {
  static async create(req, res) {
    const schema = z
      .object({
        itemType: z.string().min(1),
        description: z.string().optional(),
        quantity: z.number().int().positive().optional(),
        status: z.enum(['available', 'unavailable', 'donated']).optional()
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    const center = await Center.findByUserId(req.auth.userId);
    if (!center) return res.status(404).json({ error: 'Center not found' });
    if (!center.approved) return res.status(403).json({ error: 'Center not approved yet' });

    const item = await Item.create({
      centerId: center.id,
      itemType: parsed.data.itemType,
      description: parsed.data.description,
      quantity: parsed.data.quantity,
      status: parsed.data.status || 'available'
    });

    return res.json({ item });
  }

  static async getAll(req, res) {
    const itemType = req.query.itemType ? String(req.query.itemType) : null;
    const items = await Item.findAllAvailable(itemType);
    return res.json({ items });
  }

  static async getMine(req, res) {
    const center = await Center.findByUserId(req.auth.userId);
    if (!center) return res.status(404).json({ error: 'Center not found' });

    const status = req.query.status ? String(req.query.status) : null;
    const items = await Item.findByCenterId(center.id, status);
    
    // Calculate statistics
    const allItems = await Item.findByCenterId(center.id, null);
    const stats = {
      total: allItems.length,
      available: allItems.filter((i) => i.status === 'available').length,
      unavailable: allItems.filter((i) => i.status === 'unavailable').length,
      donated: allItems.filter((i) => i.status === 'donated').length
    };
    
    return res.json({ items, stats });
  }

  static async update(req, res) {
    const id = Number(req.params.id);
    const schema = z
      .object({
        itemType: z.string().min(1).optional(),
        description: z.string().optional(),
        quantity: z.number().int().positive().optional().nullable(),
        status: z.enum(['available', 'unavailable', 'donated']).optional()
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid body', details: parsed.error.errors });
    }

    const item = await Item.findById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const center = await Center.findByUserId(req.auth.userId);
    if (!center || item.centerId !== center.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await Item.update(id, parsed.data);
    return res.json({ item: updated });
  }

  static async delete(req, res) {
    const id = Number(req.params.id);
    const item = await Item.findById(id);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const center = await Center.findByUserId(req.auth.userId);
    if (!center || item.centerId !== center.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await Item.delete(id);
    return res.json({ ok: true });
  }
}
