import { useState, useMemo, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { users, departments, units, getUserActivityLogs, allowListedDomains, BUILDING_BLOCK_IDS, type User as UserType, type UserAccess, type UserRole, type UnitRoleAccess, type BuildingBlockAssignment } from "@/lib/mockData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SortableTableHead, useSorting, toggleSort, type SortDirection } from "@/components/ui/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  UserPlus, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Building2, 
  Mail, 
  Calendar,
  History,
  User as UserIcon,
  X,
  MoreHorizontal,
  Pencil,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Check,
  ChevronsUpDown
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Step indicator for wizards: pills + labels, completed steps clickable, current highlighted
function StepIndicator({
  steps,
  currentStep,
  onStepClick,
}: {
  steps: { label: string }[];
  currentStep: number;
  onStepClick: (step: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0 mb-4">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const clickable = isCompleted;
        return (
          <div key={index} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => clickable && onStepClick(index)}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                isCurrent && "bg-primary text-primary-foreground",
                isCompleted && !isCurrent && "bg-primary/20 text-primary hover:bg-primary/30",
                !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/20 text-xs">
                {index + 1}
              </span>
              {step.label}
            </button>
            {index < steps.length - 1 && (
              <div className="h-px w-4 bg-border" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Selection: either full department or a single unit (mutually exclusive per department)
type WizardSelection =
  | { type: "department"; departmentId: string; name: string }
  | { type: "unit"; departmentId: string; unitId: string; name: string };

function selectionKey(s: WizardSelection): string {
  return s.type === "department" ? `dept-${s.departmentId}` : `unit-${s.unitId}`;
}

// Get department abbreviation helper
function getDeptAbbreviation(departmentName: string): string {
  const dept = departments.find(d => d.name === departmentName);
  return dept?.abbreviation || departmentName;
}

// Access Tag Component - clicking opens the sidebar
function AccessTag({ 
  access, 
  onClick 
}: { 
  access: UserAccess; 
  onClick: () => void;
}) {
  const abbreviation = getDeptAbbreviation(access.departmentName);

  if (access.fullDepartment) {
    return (
      <Badge className="bg-primary text-primary-foreground">
        {abbreviation}
      </Badge>
    );
  }

  const unitCount = access.unitAccess.length;

  // Show department abbreviation + unit count (e.g., "DE - 2 units")
  return (
    <Badge 
      variant="outline" 
      className="border-primary text-primary cursor-pointer hover:bg-primary/10"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {abbreviation} - {unitCount} unit{unitCount !== 1 ? 's' : ''}
    </Badge>
  );
}

// Role Badge Component (Admin=green, Editor=amber, Viewer=blue)
function RoleBadge({ role }: { role: UserRole }) {
  const roleConfig: Record<UserRole, { label: string; className: string }> = {
    admin: { label: 'Admin', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    editor: { label: 'Editor', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    viewer: { label: 'Viewer', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' }
  };

  const config = roleConfig[role] || roleConfig.viewer;
  return (
    <Badge variant="secondary" className={config.className}>
      {config.label}
    </Badge>
  );
}

// Type for modal state: tracks per-unit roles (used when converting wizard state to UserAccess)
type ModalAccessState = Map<string, {
  fullDepartment: boolean;
  fullDepartmentRole?: UserRole;
  fullDepartmentBuildingBlocks?: BuildingBlockAssignment[];
  unitRoles: Map<string, UserRole>;
  unitBuildingBlocks?: Map<string, BuildingBlockAssignment[]>;
}>;

// Edit User Permissions Modal — 2-step wizard
function EditPermissionsModal({ user, onClose, onSave }: { user: UserType; onClose: () => void; onSave: (user: UserType, access: ModalAccessState) => void }) {
  const steps = [{ label: "Units" }, { label: "Building blocks & roles" }];
  const [step, setStep] = useState(0);
  const [permissionsSearch, setPermissionsSearch] = useState("");

  const initialSelections = useMemo(() => {
    const list: WizardSelection[] = [];
    user.access.forEach((a) => {
      if (a.fullDepartment) {
        list.push({ type: "department", departmentId: a.departmentId, name: a.departmentName });
      } else {
        a.unitAccess.forEach((ua) => {
          list.push({ type: "unit", departmentId: a.departmentId, unitId: ua.unitId, name: ua.unitName });
        });
      }
    });
    return list;
  }, [user.access]);

  const initialBuildingBlocks = useMemo(() => {
    const map = new Map<string, BuildingBlockAssignment[]>();
    user.access.forEach((a) => {
      if (a.fullDepartment && a.fullDepartmentBuildingBlocks?.length) {
        map.set(`dept-${a.departmentId}`, a.fullDepartmentBuildingBlocks);
      }
      a.unitAccess.forEach((ua) => {
        if (ua.buildingBlocks?.length) {
          map.set(`unit-${ua.unitId}`, ua.buildingBlocks);
        }
      });
    });
    return map;
  }, [user.access]);

  const [activeKeys, setActiveKeys] = useState<Set<string>>(() => new Set(initialSelections.map(selectionKey)));
  const [allSelections, setAllSelections] = useState<WizardSelection[]>(initialSelections);
  const [buildingBlocksByKey, setBuildingBlocksByKey] = useState<Map<string, BuildingBlockAssignment[]>>(initialBuildingBlocks);

  const filteredDepartments = useMemo(() => {
    if (!permissionsSearch) return departments;
    const query = permissionsSearch.toLowerCase();
    return departments.filter((d) =>
      d.name.toLowerCase().includes(query) ||
      d.abbreviation.toLowerCase().includes(query) ||
      units.filter((u) => u.departmentId === d.id).some((u) => u.name.toLowerCase().includes(query))
    );
  }, [permissionsSearch]);

  const toggleDepartment = (deptId: string) => {
    const key = `dept-${deptId}`;
    const dept = departments.find((d) => d.id === deptId);
    const deptUnits = units.filter((u) => u.departmentId === deptId);
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        deptUnits.forEach((u) => next.delete(`unit-${u.id}`));
      } else {
        deptUnits.forEach((u) => next.delete(`unit-${u.id}`));
        next.add(key);
        if (dept && !allSelections.some((s) => selectionKey(s) === key)) {
          setAllSelections((s) => [...s, { type: "department", departmentId: deptId, name: dept.name }]);
        }
      }
      return next;
    });
  };

  const toggleUnit = (deptId: string, unitId: string) => {
    const unitKey = `unit-${unitId}`;
    const deptKey = `dept-${deptId}`;
    const unit = units.find((u) => u.id === unitId);
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(unitKey)) {
        next.delete(unitKey);
      } else {
        next.delete(deptKey);
        next.add(unitKey);
        if (unit && !allSelections.some((s) => selectionKey(s) === unitKey)) {
          setAllSelections((s) => [...s, { type: "unit", departmentId: deptId, unitId, name: unit.name }]);
        }
      }
      return next;
    });
  };

  const isDeptSelected = (deptId: string) => activeKeys.has(`dept-${deptId}`);
  const isUnitSelected = (unitId: string) => activeKeys.has(`unit-${unitId}`);

  const activeSelections = useMemo(
    () => allSelections.filter((s) => activeKeys.has(selectionKey(s))),
    [allSelections, activeKeys]
  );

  const addBuildingBlock = (key: string, buildingBlockId: string, role: UserRole) => {
    setBuildingBlocksByKey((prev) => {
      const next = new Map(prev);
      const list = next.get(key) ?? [];
      if (list.some((b) => b.buildingBlockId === buildingBlockId)) return prev;
      next.set(key, [...list, { buildingBlockId, role }]);
      return next;
    });
  };

  const removeBuildingBlock = (key: string, buildingBlockId: string) => {
    setBuildingBlocksByKey((prev) => {
      const next = new Map(prev);
      const list = (next.get(key) ?? []).filter((b) => b.buildingBlockId !== buildingBlockId);
      if (list.length) next.set(key, list);
      else next.delete(key);
      return next;
    });
  };

  const setBuildingBlockRole = (key: string, buildingBlockId: string, role: UserRole) => {
    setBuildingBlocksByKey((prev) => {
      const next = new Map(prev);
      const list = (next.get(key) ?? []).map((b) =>
        b.buildingBlockId === buildingBlockId ? { ...b, role } : b
      );
      next.set(key, list);
      return next;
    });
  };

  const incompleteKeys = useMemo(() => {
    return new Set(activeSelections.filter((s) => (buildingBlocksByKey.get(selectionKey(s)) ?? []).length === 0).map(selectionKey));
  }, [activeSelections, buildingBlocksByKey]);

  const canSave = activeSelections.length > 0 && incompleteKeys.size === 0;
  const [showValidation, setShowValidation] = useState(false);

  const handleSave = () => {
    if (!canSave) {
      setShowValidation(true);
      return;
    }
    const access: ModalAccessState = new Map();
    activeSelections.forEach((s) => {
      const key = selectionKey(s);
      const blocks = buildingBlocksByKey.get(key) ?? [];
      if (s.type === "department") {
        const existing = access.get(s.departmentId);
        const dept = departments.find((d) => d.id === s.departmentId);
        if (dept) {
          access.set(s.departmentId, {
            fullDepartment: true,
            fullDepartmentRole: "viewer",
            fullDepartmentBuildingBlocks: blocks,
            unitRoles: new Map(),
          });
        }
      } else {
        const dept = departments.find((d) => d.id === s.departmentId);
        if (!dept) return;
        const existing = access.get(s.departmentId) ?? {
          fullDepartment: false,
          unitRoles: new Map<string, UserRole>(),
          unitBuildingBlocks: new Map<string, BuildingBlockAssignment[]>(),
        };
        const unitRoles = new Map(existing.unitRoles);
        const unitBuildingBlocks = new Map(existing.unitBuildingBlocks ?? []);
        unitRoles.set(s.unitId, "viewer");
        unitBuildingBlocks.set(s.unitId, blocks);
        access.set(s.departmentId, { ...existing, unitRoles, unitBuildingBlocks });
      }
    });
    onSave(user, access);
  };

  const bbCount = (key: string) => (buildingBlocksByKey.get(key) ?? []).length;

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
      <DialogHeader className="flex-shrink-0">
        <DialogTitle>Edit Permissions</DialogTitle>
        <DialogDescription>
          Modify access permissions for {user.name}. Assign building blocks and roles per unit.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0 py-4">
        <div className="p-3 bg-muted/50 rounded-lg flex-shrink-0 mb-2">
          <div className="font-medium">{user.name}</div>
          <div className="text-sm text-muted-foreground">{user.email}</div>
        </div>

        <StepIndicator steps={steps} currentStep={step} onStepClick={setStep} />

        {step === 0 && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <Label className="flex-shrink-0">Units</Label>
            <p className="text-sm text-muted-foreground flex-shrink-0 mb-2">
              Select departments (full access) or individual units. Show &quot;· N BBs&quot; for existing building blocks.
            </p>
            <div className="relative mb-2 flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search departments or units..."
                value={permissionsSearch}
                onChange={(e) => setPermissionsSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex-1 min-h-0 rounded-md border overflow-y-auto overflow-x-hidden overscroll-contain">
                <div className="p-4 space-y-4">
                {filteredDepartments.map((dept) => {
                  const deptUnits = units.filter((u) => u.departmentId === dept.id);
                  const fullSelected = isDeptSelected(dept.id);
                  return (
                    <div key={dept.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-dept-${dept.id}`}
                            checked={fullSelected}
                            onCheckedChange={() => toggleDepartment(dept.id)}
                          />
                          <label htmlFor={`edit-dept-${dept.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            {dept.name}
                            <span className="text-xs text-muted-foreground">(full access)</span>
                          </label>
                        </div>
                      </div>
                      {!fullSelected && deptUnits.length > 0 && (
                        <div className="ml-6 space-y-2 border-l-2 border-muted pl-4">
                          {deptUnits.map((unit) => {
                            const sel = isUnitSelected(unit.id);
                            const n = bbCount(`unit-${unit.id}`);
                            return (
                              <div key={unit.id} className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`edit-unit-${unit.id}`}
                                    checked={sel}
                                    onCheckedChange={() => toggleUnit(dept.id, unit.id)}
                                  />
                                  <label htmlFor={`edit-unit-${unit.id}`} className="text-sm cursor-pointer">
                                    {unit.name}
                                    {n > 0 && <span className="text-muted-foreground"> · {n} BBs</span>}
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <Label className="flex-shrink-0">Building blocks & roles</Label>
            <p className="text-sm text-muted-foreground flex-shrink-0 mb-2">
              Deselected units are greyed out; configuration is kept until you save. Each active unit must have at least one building block.
            </p>
            {showValidation && incompleteKeys.size > 0 && (
              <Alert variant="destructive" className="mb-2 flex-shrink-0">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Each unit must have at least one building block assigned before saving.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex-1 min-h-0 rounded-md border overflow-y-auto overflow-x-hidden overscroll-contain">
              <div className="p-4 space-y-4">
                {allSelections.map((s) => {
                  const key = selectionKey(s);
                  const isActive = activeKeys.has(key);
                  const blocks = buildingBlocksByKey.get(key) ?? [];
                  const isIncomplete = isActive && blocks.length === 0;
                  return (
                    <Card
                      key={key}
                      className={cn(
                        "p-4",
                        !isActive && "opacity-60 pointer-events-none"
                      )}
                    >
                      <div className="font-medium flex items-center gap-2">
                        {s.name}
                        {!isActive && <span className="text-xs text-muted-foreground">(deselected)</span>}
                        {showValidation && isIncomplete && (
                          <Badge variant="destructive" className="text-xs">Add at least one building block</Badge>
                        )}
                      </div>
                      {isActive && (
                        <div className="mt-3 space-y-2">
                          {blocks.length === 0 && (
                            <p className="text-sm text-muted-foreground">No building blocks added yet</p>
                          )}
                          {blocks.map((b) => (
                            <div key={b.buildingBlockId} className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm">{b.buildingBlockId}</span>
                              <Select value={b.role} onValueChange={(v) => setBuildingBlockRole(key, b.buildingBlockId, v as UserRole)}>
                                <SelectTrigger className="w-24 h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="editor">Editor</SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                              </Select>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeBuildingBlock(key, b.buildingBlockId)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Select
                            onValueChange={(v) => {
                              addBuildingBlock(key, v, "viewer");
                            }}
                            value=""
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Add building block" />
                            </SelectTrigger>
                            <SelectContent>
                              {BUILDING_BLOCK_IDS.filter((id) => !blocks.some((b) => b.buildingBlockId === id)).map((id) => (
                                <SelectItem key={id} value={id}>
                                  {id}
                                </SelectItem>
                              ))}
                              {(buildingBlocksByKey.get(key) ?? []).length >= BUILDING_BLOCK_IDS.length && (
                                <SelectItem value="_none" disabled>
                                  All added
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
          </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex-shrink-0 pt-4 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {step === 0 ? (
          <Button onClick={() => setStep(1)} disabled={activeSelections.length === 0}>
            Next
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button onClick={handleSave} disabled={activeSelections.length === 0}>
              Save Changes
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

// Invite User Modal — 3-step wizard
function InviteUserModal({
  onClose,
  onSave,
  existingUsers,
}: {
  onClose: () => void;
  onSave: (name: string, email: string, access: ModalAccessState) => void;
  existingUsers: UserType[];
}) {
  const steps = [{ label: "Identity" }, { label: "Units" }, { label: "Building blocks & roles" }];
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selections, setSelections] = useState<WizardSelection[]>([]);
  const [buildingBlocksByKey, setBuildingBlocksByKey] = useState<Map<string, BuildingBlockAssignment[]>>(new Map());
  const [inviteUnitsSearch, setInviteUnitsSearch] = useState("");

  const emailDomain = useMemo(() => {
    if (!email.includes("@")) return null;
    return email.split("@")[1]?.toLowerCase();
  }, [email]);

  const allowListMatch = useMemo(() => {
    if (!emailDomain) return null;
    return allowListedDomains.find(
      (d) =>
        emailDomain === d.domain.toLowerCase() ||
        emailDomain.endsWith("." + d.domain.toLowerCase())
    );
  }, [emailDomain]);

  const existingUser = useMemo(() => {
    if (!email) return null;
    return existingUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }, [email, existingUsers]);

  const allowedDepartments = useMemo(() => {
    if (!allowListMatch) return [];
    return departments.filter((d) => allowListMatch.departmentIds.includes(d.id));
  }, [allowListMatch]);

  const filteredAllowedDepartments = useMemo(() => {
    if (!inviteUnitsSearch) return allowedDepartments;
    const query = inviteUnitsSearch.toLowerCase();
    return allowedDepartments.filter(
      (d) =>
        d.name.toLowerCase().includes(query) ||
        d.abbreviation.toLowerCase().includes(query) ||
        units.filter((u) => u.departmentId === d.id).some((u) => u.name.toLowerCase().includes(query))
    );
  }, [allowedDepartments, inviteUnitsSearch]);

  const hasValidEmail = email.includes("@") && !!emailDomain;
  const hasError = hasValidEmail && (!allowListMatch || !!existingUser);
  const canProceedFromStep0 = hasValidEmail && !!allowListMatch && !existingUser;

  const toggleDepartment = (deptId: string) => {
    const dept = departments.find((d) => d.id === deptId);
    const deptUnits = units.filter((u) => u.departmentId === deptId);
    const key = `dept-${deptId}`;
    setSelections((prev) => {
      const hasDept = prev.some((s) => s.type === "department" && s.departmentId === deptId);
      if (hasDept) {
        return prev.filter((s) => selectionKey(s) !== key && (s.type !== "unit" || s.departmentId !== deptId));
      }
      const withoutDeptUnits = prev.filter((s) => !(s.type === "unit" && s.departmentId === deptId));
      if (dept) return [...withoutDeptUnits, { type: "department" as const, departmentId: deptId, name: dept.name }];
      return withoutDeptUnits;
    });
  };

  const toggleUnit = (deptId: string, unitId: string) => {
    const unit = units.find((u) => u.id === unitId);
    const deptKey = `dept-${deptId}`;
    const unitKey = `unit-${unitId}`;
    setSelections((prev) => {
      const hasUnit = prev.some((s) => s.type === "unit" && s.unitId === unitId);
      if (hasUnit) {
        return prev.filter((s) => selectionKey(s) !== unitKey);
      }
      const withoutDept = prev.filter((s) => selectionKey(s) !== deptKey);
      if (unit) return [...withoutDept, { type: "unit" as const, departmentId: deptId, unitId, name: unit.name }];
      return withoutDept;
    });
  };

  const isDeptSelected = (deptId: string) => selections.some((s) => s.type === "department" && s.departmentId === deptId);
  const isUnitSelected = (unitId: string) => selections.some((s) => s.type === "unit" && s.unitId === unitId);

  const addBuildingBlock = (key: string, buildingBlockId: string, role: UserRole) => {
    setBuildingBlocksByKey((prev) => {
      const next = new Map(prev);
      const list = next.get(key) ?? [];
      if (list.some((b) => b.buildingBlockId === buildingBlockId)) return prev;
      next.set(key, [...list, { buildingBlockId, role }]);
      return next;
    });
  };

  const removeBuildingBlock = (key: string, buildingBlockId: string) => {
    setBuildingBlocksByKey((prev) => {
      const next = new Map(prev);
      const list = (next.get(key) ?? []).filter((b) => b.buildingBlockId !== buildingBlockId);
      if (list.length) next.set(key, list);
      else next.delete(key);
      return next;
    });
  };

  const setBuildingBlockRole = (key: string, buildingBlockId: string, role: UserRole) => {
    setBuildingBlocksByKey((prev) => {
      const next = new Map(prev);
      const list = (next.get(key) ?? []).map((b) =>
        b.buildingBlockId === buildingBlockId ? { ...b, role } : b
      );
      next.set(key, list);
      return next;
    });
  };

  const incompleteKeys = useMemo(
    () => new Set(selections.filter((s) => (buildingBlocksByKey.get(selectionKey(s)) ?? []).length === 0).map(selectionKey)),
    [selections, buildingBlocksByKey]
  );
  const [showValidation, setShowValidation] = useState(false);

  const canSend = name.trim() && email && selections.length > 0 && !hasError && incompleteKeys.size === 0;
  const canClickSend = name.trim() && email && selections.length > 0 && !hasError;

  const handleSendInvitation = () => {
    if (!canSend) {
      if (step < 2) return;
      setShowValidation(true);
      return;
    }
    const access: ModalAccessState = new Map();
    selections.forEach((s) => {
      const key = selectionKey(s);
      const blocks = buildingBlocksByKey.get(key) ?? [];
      if (s.type === "department") {
        const dept = departments.find((d) => d.id === s.departmentId);
        if (dept) {
          access.set(s.departmentId, {
            fullDepartment: true,
            fullDepartmentRole: "viewer",
            fullDepartmentBuildingBlocks: blocks,
            unitRoles: new Map(),
          });
        }
      } else {
        const dept = departments.find((d) => d.id === s.departmentId);
        if (!dept) return;
        const existing = access.get(s.departmentId) ?? {
          fullDepartment: false,
          unitRoles: new Map<string, UserRole>(),
          unitBuildingBlocks: new Map<string, BuildingBlockAssignment[]>(),
        };
        const unitRoles = new Map(existing.unitRoles);
        const unitBuildingBlocks = new Map(existing.unitBuildingBlocks ?? []);
        unitRoles.set(s.unitId, "viewer");
        unitBuildingBlocks.set(s.unitId, blocks);
        access.set(s.departmentId, { ...existing, unitRoles, unitBuildingBlocks });
      }
    });
    onSave(name.trim(), email, access);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle>Invite User</DialogTitle>
        <DialogDescription>
          Invite a civil servant to access the platform. Complete identity, units, and building blocks.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-hidden flex flex-col space-y-4 py-4">
        <StepIndicator steps={steps} currentStep={step} onStepClick={setStep} />

        {step === 0 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Full name</Label>
                <Input
                  id="invite-name"
                  placeholder="e.g., John O'Brien"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="e.g., john.obrien@gov.ie"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setSelections([]);
                    setBuildingBlocksByKey(new Map());
                  }}
                  className={hasError ? "border-destructive" : ""}
                />
              </div>
            </div>
            {hasValidEmail && !allowListMatch && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Domain not in allow list</AlertTitle>
                <AlertDescription className="flex items-start justify-between gap-4">
                  <span>
                    The domain &quot;@{emailDomain}&quot; is not in the allow list. Only users from allowed domains can be invited.
                  </span>
                  <Button variant="outline" size="sm" className="shrink-0" asChild>
                    <Link to="/allow-list">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Manage Allow List
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {hasValidEmail && allowListMatch && !existingUser && (
              <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
                <Check className="h-4 w-4 text-green-600" />
                <AlertTitle>Domain whitelisted</AlertTitle>
                <AlertDescription>
                  Domain @{emailDomain} is whitelisted → {allowedDepartments.length} department{allowedDepartments.length !== 1 ? "s" : ""} available
                </AlertDescription>
              </Alert>
            )}
            {existingUser && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>User already exists</AlertTitle>
                <AlertDescription>
                  A user with this email ({existingUser.name}) already exists. You can edit their permissions instead.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-muted-foreground">
              Select departments (full access) or individual units. Department and its units are mutually exclusive.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search departments or units..."
                value={inviteUnitsSearch}
                onChange={(e) => setInviteUnitsSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <ScrollArea className="h-[220px] rounded-md border p-4">
              <div className="space-y-4">
                {filteredAllowedDepartments.map((dept) => {
                  const deptUnits = units.filter((u) => u.departmentId === dept.id);
                  const fullSelected = isDeptSelected(dept.id);
                  return (
                    <div key={dept.id} className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`inv-dept-${dept.id}`}
                          checked={fullSelected}
                          onCheckedChange={() => toggleDepartment(dept.id)}
                        />
                        <label htmlFor={`inv-dept-${dept.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary" />
                          {dept.name}
                          <span className="text-xs text-muted-foreground">(full access)</span>
                        </label>
                      </div>
                      {!fullSelected && deptUnits.length > 0 && (
                        <div className="ml-6 space-y-2 border-l-2 border-muted pl-4">
                          {deptUnits.map((unit) => (
                            <div key={unit.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`inv-unit-${unit.id}`}
                                checked={isUnitSelected(unit.id)}
                                onCheckedChange={() => toggleUnit(dept.id, unit.id)}
                              />
                              <label htmlFor={`inv-unit-${unit.id}`} className="text-sm cursor-pointer">
                                {unit.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {allowedDepartments.length === 0 && canProceedFromStep0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No departments available for this domain.</p>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-muted-foreground">
              Add at least one building block per selection. Each block has a role (Admin, Editor, Viewer).
            </p>
            {showValidation && incompleteKeys.size > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Each unit must have at least one building block assigned before sending the invitation.
                </AlertDescription>
              </Alert>
            )}
            <ScrollArea className="h-[260px] rounded-md border p-4">
              <div className="space-y-4">
                {selections.map((s) => {
                  const key = selectionKey(s);
                  const blocks = buildingBlocksByKey.get(key) ?? [];
                  const isIncomplete = blocks.length === 0;
                  return (
                    <Card
                      key={key}
                      className={cn("p-4", showValidation && isIncomplete && "ring-2 ring-destructive")}
                    >
                      <div className="font-medium">
                        {s.name}
                        {showValidation && isIncomplete && (
                          <Badge variant="destructive" className="ml-2 text-xs">Add at least one building block</Badge>
                        )}
                      </div>
                      <div className="mt-3 space-y-2">
                        {blocks.length === 0 && <p className="text-sm text-muted-foreground">No building blocks added yet</p>}
                        {blocks.map((b) => (
                          <div key={b.buildingBlockId} className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm">{b.buildingBlockId}</span>
                            <Select value={b.role} onValueChange={(v) => setBuildingBlockRole(key, b.buildingBlockId, v as UserRole)}>
                              <SelectTrigger className="w-24 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeBuildingBlock(key, b.buildingBlockId)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Select
                          onValueChange={(v) => {
                            if (v && v !== "_none") addBuildingBlock(key, v, "viewer");
                          }}
                          value=""
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Add building block" />
                          </SelectTrigger>
                          <SelectContent>
                            {BUILDING_BLOCK_IDS.filter((id) => !blocks.some((b) => b.buildingBlockId === id)).map((id) => (
                              <SelectItem key={id} value={id}>
                                {id}
                              </SelectItem>
                            ))}
                            {blocks.length >= BUILDING_BLOCK_IDS.length && (
                              <SelectItem value="_none" disabled>
                                All added
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      <DialogFooter className="flex-shrink-0 pt-4 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {step < 2 ? (
          <>
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 0 && !canProceedFromStep0) ||
                (step === 1 && selections.length === 0)
              }
            >
              Next
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={handleSendInvitation} disabled={!canClickSend}>
              <UserPlus className="h-4 w-4 mr-2" />
              Send invitation
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

// User Detail Sidebar - removed "Full Access" tag
function UserDetailSheet({ 
  user, 
  open, 
  onClose,
  onEditPermissions,
  onDeleteUser,
  canModify,
  canDelete
}: { 
  user: UserType | null; 
  open: boolean; 
  onClose: () => void;
  onEditPermissions: (user: UserType) => void;
  onDeleteUser: (user: UserType) => void;
  canModify: boolean;
  canDelete: boolean;
}) {
  const logs = user ? getUserActivityLogs(user.id) : [];
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [openDepartments, setOpenDepartments] = useState<Set<number>>(new Set());
  const [tabValue, setTabValue] = useState<"details" | "activity">("details");

  useEffect(() => {
    if (user) setOpenDepartments(new Set(user.access.map((_, i) => i)));
  }, [user]);

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="flex h-full w-[500px] flex-col overflow-hidden sm:max-w-[500px]">
        {/* Top section: fixed — header + tabs */}
        <div className="shrink-0">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full">
                <UserIcon className="h-5 w-5 text-primary" />
              </div>
              {user.name}
            </SheetTitle>
            <SheetDescription>{user.email}</SheetDescription>
          </SheetHeader>
          <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as "details" | "activity")} className="mt-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="activity">Activity Log</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Middle section: scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tabValue === "details" && (
            <div className="mt-4 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{user.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Added on {user.addedAt} by {user.addedBy}</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-medium text-sm">Access Permissions</h4>
              <div className="space-y-2">
                {user.access.map((access, index) => {
                  const isFullDept = access.fullDepartment;
                  const assignmentCount = isFullDept
                    ? (access.fullDepartmentBuildingBlocks?.length ?? 0)
                    : access.unitAccess.reduce((sum, ua) => sum + (ua.buildingBlocks?.length ?? 0), 0);
                  const unitCount = access.unitAccess.length;
                  const summary = isFullDept
                    ? `full access · ${assignmentCount} assignment${assignmentCount !== 1 ? "s" : ""}`
                    : `${unitCount} unit${unitCount !== 1 ? "s" : ""} · ${assignmentCount} assignment${assignmentCount !== 1 ? "s" : ""}`;
                  const isOpen = openDepartments.has(index);

                  return (
                    <Collapsible
                      key={index}
                      open={isOpen}
                      onOpenChange={(open) =>
                        setOpenDepartments((prev) => {
                          const next = new Set(prev);
                          if (open) next.add(index);
                          else next.delete(index);
                          return next;
                        })
                      }
                      className="rounded-lg bg-muted/50"
                    >
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/50 rounded-lg transition-colors">
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium text-sm truncate">{access.departmentName}</span>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{summary}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            isOpen && "rotate-180"
                          )}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 pt-0 space-y-3">
                          {isFullDept ? (
                            <div className="space-y-2">
                              {access.fullDepartmentBuildingBlocks && access.fullDepartmentBuildingBlocks.length > 0 ? (
                                <div className="space-y-1.5">
                                  {access.fullDepartmentBuildingBlocks.map((bb, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                                      <span className="text-muted-foreground">{bb.buildingBlockId}</span>
                                      <RoleBadge role={bb.role} />
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {access.unitAccess.map((ua, idx) => (
                                <div key={idx} className="space-y-2">
                                  <div className="flex items-center gap-2 text-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                                    <span className="font-medium text-muted-foreground">{ua.unitName}</span>
                                  </div>
                                  {ua.buildingBlocks && ua.buildingBlocks.length > 0 ? (
                                    <div className="ml-5 space-y-1.5">
                                      {ua.buildingBlocks.map((bb, i) => (
                                        <div key={i} className="flex items-center justify-between gap-2 text-sm">
                                          <span className="text-muted-foreground">{bb.buildingBlockId}</span>
                                          <RoleBadge role={bb.role} />
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
            </div>
          )}

          {tabValue === "activity" && (
            <div className="mt-4 space-y-3">
              {logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No activity logs found</p>
                </div>
              ) : (
                logs.map((log) => (
                  <Link
                    key={log.id}
                    to={`/activity-logs?highlight=${log.id}`}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors group"
                  >
                    <div className="flex-1">
                      <p className="text-sm">{log.description}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span>{log.performedBy}</span>
                        <span>•</span>
                        <span>{format(new Date(log.timestamp), "MMM d, yyyy 'at' h:mm a")}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </Link>
                ))
              )}
            </div>
          )}
        </div>

        {/* Bottom section: fixed — action buttons */}
        {canModify && (
          <div className="shrink-0 border-t pt-4">
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  onEditPermissions(user);
                  onClose();
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit Permissions
              </Button>
              {canDelete && (
                <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex-1">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete User
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete User</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete "{user.name}"? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => {
                          onDeleteUser(user);
                          onClose();
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Searchable Filter Dropdown Component
function SearchableFilterDropdown({
  value,
  onValueChange,
  options,
  placeholder,
  allLabel,
  className
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: { id: string; label: string }[];
  placeholder: string;
  allLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(query));
  }, [options, searchQuery]);

  const selectedLabel = value === "all" 
    ? allLabel 
    : options.find(o => o.id === value)?.label || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between", className)}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 bg-popover" align="start">
        <Command>
          <CommandInput 
            placeholder={`Search ${placeholder.toLowerCase()}...`} 
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => {
                  onValueChange("all");
                  setOpen(false);
                  setSearchQuery("");
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === "all" ? "opacity-100" : "opacity-0"
                  )}
                />
                {allLabel}
              </CommandItem>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.id);
                    setOpen(false);
                    setSearchQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function UsersPage() {
  const [searchParams] = useSearchParams();
  const { canModify, canDelete, isReadOnly } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState(searchParams.get("department") || "all");
  const [unitFilter, setUnitFilter] = useState(searchParams.get("unit") || "all");
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [userList, setUserList] = useState(users);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [userToDelete, setUserToDelete] = useState<UserType | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (key: string) => {
    const result = toggleSort(key, sortKey, sortDirection);
    setSortKey(result.key);
    setSortDirection(result.direction);
  };

  const filteredUsers = useMemo(() => {
    return userList.filter(user => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!user.name.toLowerCase().includes(query) && !user.email.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Department filter
      if (departmentFilter !== "all") {
        if (!user.access.some(a => a.departmentId === departmentFilter)) {
          return false;
        }
      }

      // Unit filter
      if (unitFilter !== "all") {
        if (!user.access.some(a => a.unitAccess.some(ua => ua.unitId === unitFilter))) {
          return false;
        }
      }

    return true;
    });
  }, [searchQuery, departmentFilter, unitFilter, userList]);

  const sortedUsers = useSorting(filteredUsers, sortKey, sortDirection, (user, key) => {
    if (key === "name") return user.name;
    if (key === "access") {
      // Sort by first department name
      return user.access[0]?.departmentName || "";
    }
    return "";
  });

  const availableUnits = useMemo(() => {
    if (departmentFilter === "all") return units;
    return units.filter(u => u.departmentId === departmentFilter);
  }, [departmentFilter]);

  const departmentOptions = useMemo(() => 
    departments.map(d => ({ id: d.id, label: d.abbreviation })),
  []);

  const unitOptions = useMemo(() => 
    availableUnits.map(u => ({ id: u.id, label: u.name })),
  [availableUnits]);

  const handleDeleteUser = (user: UserType) => {
    setUserList(userList.filter(u => u.id !== user.id));
    setSelectedUser(null);
    setUserToDelete(null);
    setSelectedUsers(prev => {
      const next = new Set(prev);
      next.delete(user.id);
      return next;
    });
  };

  const handleBulkDelete = () => {
    setUserList(userList.filter(u => !selectedUsers.has(u.id)));
    setSelectedUsers(new Set());
  };

  const toggleUserSelection = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleAllUsers = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const handleEditPermissions = (user: UserType) => {
    setEditingUser(user);
    setIsEditOpen(true);
  };

  const handleInviteUser = (name: string, email: string, accessMap: ModalAccessState) => {
    const newAccess: UserAccess[] = [];
    accessMap.forEach((value, deptId) => {
      const dept = departments.find((d) => d.id === deptId);
      if (dept) {
        const unitAccessList: UnitRoleAccess[] = [];
        value.unitRoles.forEach((role, unitId) => {
          const unit = units.find((u) => u.id === unitId);
          if (unit) {
            const buildingBlocks = value.unitBuildingBlocks?.get(unitId);
            unitAccessList.push({ unitId, unitName: unit.name, role, buildingBlocks: buildingBlocks?.length ? buildingBlocks : undefined });
          }
        });
        newAccess.push({
          departmentId: deptId,
          departmentName: dept.name,
          fullDepartment: value.fullDepartment,
          fullDepartmentRole: value.fullDepartmentRole,
          fullDepartmentBuildingBlocks: value.fullDepartmentBuildingBlocks?.length ? value.fullDepartmentBuildingBlocks : undefined,
          unitAccess: unitAccessList,
        });
      }
    });

    const newUser: UserType = {
      id: `user-${Date.now()}`,
      name,
      email,
      access: newAccess,
      addedAt: new Date().toISOString().split("T")[0],
      addedBy: "Current Admin",
    };

    setUserList([...userList, newUser]);
    setIsInviteOpen(false);
  };

  const handleSavePermissions = (user: UserType, accessMap: ModalAccessState) => {
    const newAccess: UserAccess[] = [];
    accessMap.forEach((value, deptId) => {
      const dept = departments.find((d) => d.id === deptId);
      if (dept) {
        const unitAccessList: UnitRoleAccess[] = [];
        value.unitRoles.forEach((role, unitId) => {
          const unit = units.find((u) => u.id === unitId);
          if (unit) {
            const buildingBlocks = value.unitBuildingBlocks?.get(unitId);
            unitAccessList.push({ unitId, unitName: unit.name, role, buildingBlocks: buildingBlocks?.length ? buildingBlocks : undefined });
          }
        });
        newAccess.push({
          departmentId: deptId,
          departmentName: dept.name,
          fullDepartment: value.fullDepartment,
          fullDepartmentRole: value.fullDepartmentRole,
          fullDepartmentBuildingBlocks: value.fullDepartmentBuildingBlocks?.length ? value.fullDepartmentBuildingBlocks : undefined,
          unitAccess: unitAccessList,
        });
      }
    });

    setUserList(userList.map((u) => (u.id === user.id ? { ...u, access: newAccess } : u)));
    setIsEditOpen(false);
    setEditingUser(null);
  };

  return (
    <AppLayout
      title="Users"
    >
      <p className="text-muted-foreground mb-6">
        Manage civil servants' access to form submissions across departments and units.
      </p>

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {selectedUsers.size > 0 && canDelete ? (
          // Bulk Actions Mode - only for Super Admin who can delete
          <>
            <div className="flex items-center gap-3 flex-1">
              <Badge variant="secondary" className="px-3 py-1.5">
                {selectedUsers.size} selected
              </Badge>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setSelectedUsers(new Set())}
              >
                <X className="h-4 w-4 mr-1" />
                Clear selection
              </Button>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Users</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {selectedUsers.size} selected user{selectedUsers.size > 1 ? 's' : ''}? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleBulkDelete}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          // Normal Mode
          <>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <SearchableFilterDropdown
              value={departmentFilter}
              onValueChange={(v) => { setDepartmentFilter(v); setUnitFilter("all"); }}
              options={departmentOptions}
              placeholder="Department"
              allLabel="All Departments"
              className="w-[200px]"
            />

            {departmentFilter !== "all" && (
              <SearchableFilterDropdown
                value={unitFilter}
                onValueChange={setUnitFilter}
                options={unitOptions}
                placeholder="Unit"
                allLabel="All Units"
                className="w-[200px]"
              />
            )}

            {canModify && (
              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger asChild>
                  <Button className="ml-auto">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite User
                  </Button>
                </DialogTrigger>
                <InviteUserModal 
                  key={isInviteOpen ? "open" : "closed"}
                  onClose={() => setIsInviteOpen(false)} 
                  onSave={handleInviteUser}
                  existingUsers={userList}
                />
              </Dialog>
            )}
          </>
        )}
      </div>

      {/* Active Filters */}
      {(departmentFilter !== "all" || unitFilter !== "all") && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {departmentFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {departments.find(d => d.id === departmentFilter)?.abbreviation}
              <button onClick={() => { setDepartmentFilter("all"); setUnitFilter("all"); }}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {unitFilter !== "all" && (
            <Badge variant="secondary" className="gap-1">
              {units.find(u => u.id === unitFilter)?.name}
              <button onClick={() => setUnitFilter("all")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Users Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox 
                  checked={selectedUsers.size === sortedUsers.length && sortedUsers.length > 0}
                  onCheckedChange={toggleAllUsers}
                />
              </TableHead>
              <SortableTableHead
                sortKey="name"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              >
                Name
              </SortableTableHead>
              <SortableTableHead
                sortKey="access"
                currentSortKey={sortKey}
                currentSortDirection={sortDirection}
                onSort={handleSort}
              >
                Has Access To
              </SortableTableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No users found matching your criteria.
                </TableCell>
              </TableRow>
            ) : (
              sortedUsers.map((user) => (
                <TableRow 
                  key={user.id} 
                  className={`cursor-pointer hover:bg-muted/50 ${selectedUsers.has(user.id) ? 'bg-muted/30' : ''}`}
                  onClick={() => setSelectedUser(user)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox 
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => toggleUserSelection(user.id, { stopPropagation: () => {} } as React.MouseEvent)}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 items-start">
                      {user.access.map((access, index) => (
                        <AccessTag 
                          key={index} 
                          access={access} 
                          onClick={() => setSelectedUser(user)}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {canModify && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditPermissions(user);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit permissions
                          </DropdownMenuItem>
                          {canDelete && (
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUserToDelete(user);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete user
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* User Detail Sidebar */}
      <UserDetailSheet 
        user={selectedUser} 
        open={!!selectedUser} 
        onClose={() => setSelectedUser(null)}
        onEditPermissions={handleEditPermissions}
        onDeleteUser={handleDeleteUser}
        canModify={canModify}
        canDelete={canDelete}
      />

      {/* Edit Permissions Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        {editingUser && (
          <EditPermissionsModal 
            user={editingUser} 
            onClose={() => { setIsEditOpen(false); setEditingUser(null); }} 
            onSave={handleSavePermissions}
          />
        )}
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{userToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => userToDelete && handleDeleteUser(userToDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
