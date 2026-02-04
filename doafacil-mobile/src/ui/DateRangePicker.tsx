import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

type Props = {
  dateFrom: string | null;
  dateTo: string | null;
  onSelect: (from: string | null, to: string | null) => void;
  onClear: () => void;
};

export function DateRangePicker({ dateFrom, dateTo, onSelect, onClear }: Props) {
  const [visible, setVisible] = useState(false);
  const [tempFrom, setTempFrom] = useState<string | null>(dateFrom);
  const [tempTo, setTempTo] = useState<string | null>(dateTo);

  const today = new Date();
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDate = (dateStr: string | null): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  };

  const formatDisplayDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Selecionar';
    const date = parseDate(dateStr);
    if (!date) return 'Selecionar';
    return date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleConfirm = () => {
    onSelect(tempFrom, tempTo);
    setVisible(false);
  };

  const handleCancel = () => {
    setTempFrom(dateFrom);
    setTempTo(dateTo);
    setVisible(false);
  };

  const generateMonthDays = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before the first day of the month
    // In JavaScript, getDay() returns 0 for Sunday, 1 for Monday, etc.
    const firstDayOfWeek = firstDay.getDay();
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const monthDays = generateMonthDays(currentMonth.getFullYear(), currentMonth.getMonth());
  const monthName = currentMonth.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  const isDateSelected = (date: Date): 'from' | 'to' | 'range' | null => {
    if (!tempFrom && !tempTo) return null;
    const dateStr = formatDate(date);
    if (tempFrom === dateStr) return 'from';
    if (tempTo === dateStr) return 'to';
    if (tempFrom && tempTo) {
      const fromDate = parseDate(tempFrom);
      const toDate = parseDate(tempTo);
      if (fromDate && toDate && date >= fromDate && date <= toDate) {
        return 'range';
      }
    }
    return null;
  };

  const handleDatePress = (date: Date) => {
    const dateStr = formatDate(date);
    const dateObj = parseDate(dateStr);
    if (!dateObj) return;

    if (!tempFrom) {
      setTempFrom(dateStr);
    } else if (!tempTo) {
      if (dateObj < parseDate(tempFrom)!) {
        setTempTo(tempFrom);
        setTempFrom(dateStr);
      } else {
        setTempTo(dateStr);
      }
    } else {
      setTempFrom(dateStr);
      setTempTo(null);
    }
  };

  const isDateDisabled = (date: Date): boolean => {
    return date > today;
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentMonth);
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentMonth(newMonth);
  };

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <>
      <Pressable onPress={() => setVisible(true)} style={styles.trigger}>
        <Text style={styles.triggerText}>
          📅 {dateFrom && dateTo ? `${formatDisplayDate(dateFrom)} - ${formatDisplayDate(dateTo)}` : dateFrom ? `Desde ${formatDisplayDate(dateFrom)}` : 'Selecionar período'}
        </Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selecionar Período</Text>

            <View style={styles.monthHeader}>
              <Pressable onPress={() => navigateMonth('prev')} style={styles.monthNav}>
                <Text style={styles.monthNavText}>‹</Text>
              </Pressable>
              <Text style={styles.monthName}>{monthName}</Text>
              <Pressable 
                onPress={() => navigateMonth('next')} 
                style={styles.monthNav}
                disabled={currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear()}
              >
                <Text style={[styles.monthNavText, currentMonth.getMonth() === today.getMonth() && currentMonth.getFullYear() === today.getFullYear() && styles.monthNavDisabled]}>›</Text>
              </Pressable>
            </View>

            <View style={styles.calendar}>
              <View style={styles.weekDaysRow}>
                {weekDays.map((day) => (
                  <View key={day} style={styles.weekDay}>
                    <Text style={styles.weekDayText}>{day}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {monthDays.map((date, idx) => {
                  if (!date) {
                    return <View key={`empty-${idx}`} style={styles.dayCell} />;
                  }
                  const selected = isDateSelected(date);
                  const disabled = isDateDisabled(date);
                  return (
                    <Pressable
                      key={formatDate(date)}
                      onPress={() => !disabled && handleDatePress(date)}
                      style={[
                        styles.dayCell,
                        selected === 'from' && styles.dayFrom,
                        selected === 'to' && styles.dayTo,
                        selected === 'range' && styles.dayRange,
                        disabled && styles.dayDisabled
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          selected && styles.dayTextSelected,
                          disabled && styles.dayTextDisabled
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.selectedRange}>
              <Text style={styles.selectedRangeLabel}>Período selecionado:</Text>
              <Text style={styles.selectedRangeText}>
                {tempFrom && tempTo
                  ? `${formatDisplayDate(tempFrom)} - ${formatDisplayDate(tempTo)}`
                  : tempFrom
                  ? `Desde ${formatDisplayDate(tempFrom)}`
                  : 'Nenhum período selecionado'}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable 
                onPress={() => {
                  setTempFrom(null);
                  setTempTo(null);
                  onClear();
                  setVisible(false);
                }} 
                style={[styles.modalBtn, styles.modalBtnSecondary]}
              >
                <Text style={styles.modalBtnText}>Limpar</Text>
              </Pressable>
              <Pressable onPress={handleCancel} style={[styles.modalBtn, styles.modalBtnSecondary]}>
                <Text style={styles.modalBtnText}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={handleConfirm} style={[styles.modalBtn, styles.modalBtnPrimary]}>
                <Text style={[styles.modalBtnText, styles.modalBtnTextPrimary]}>Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  triggerText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalTitle: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthNav: {
    padding: 8,
  },
  monthNavText: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  monthNavDisabled: {
    opacity: 0.3,
  },
  monthName: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 16,
    textTransform: 'capitalize',
  },
  calendar: {
    marginBottom: 16,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 12,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  dayFrom: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  dayTo: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  dayRange: {
    backgroundColor: colors.primary + '40',
  },
  dayDisabled: {
    opacity: 0.3,
  },
  dayText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  dayTextSelected: {
    color: '#fff',
  },
  dayTextDisabled: {
    color: colors.muted,
  },
  selectedRange: {
    padding: 12,
    backgroundColor: colors.card2,
    borderRadius: 12,
    marginBottom: 16,
  },
  selectedRangeLabel: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 4,
  },
  selectedRangeText: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalBtnSecondary: {
    backgroundColor: colors.card2,
    borderColor: colors.border,
  },
  modalBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalBtnText: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 14,
  },
  modalBtnTextPrimary: {
    color: '#fff',
  },
});
