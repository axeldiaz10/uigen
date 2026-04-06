import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --- mocks ---

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignInAction = vi.fn();
const mockSignUpAction = vi.fn();
vi.mock("@/actions", () => ({
  signIn: (...args: unknown[]) => mockSignInAction(...args),
  signUp: (...args: unknown[]) => mockSignUpAction(...args),
}));

const mockGetAnonWorkData = vi.fn();
const mockClearAnonWork = vi.fn();
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => mockGetAnonWorkData(),
  clearAnonWork: () => mockClearAnonWork(),
}));

const mockGetProjects = vi.fn();
vi.mock("@/actions/get-projects", () => ({
  getProjects: () => mockGetProjects(),
}));

const mockCreateProject = vi.fn();
vi.mock("@/actions/create-project", () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

// --- helpers ---

import { useAuth } from "@/hooks/use-auth";

function renderAuth() {
  return renderHook(() => useAuth());
}

// --- tests ---

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no anon work, no existing projects, project creation succeeds
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "new-project-id" });
  });

  test("exposes signIn, signUp, and isLoading", () => {
    const { result } = renderAuth();
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
    expect(result.current.isLoading).toBe(false);
  });

  // -----------------------------------------------------------------------
  // isLoading state
  // -----------------------------------------------------------------------

  describe("isLoading", () => {
    test("is true while signIn is in-flight", async () => {
      let resolveSignIn!: (v: { success: boolean }) => void;
      mockSignInAction.mockReturnValue(
        new Promise((res) => {
          resolveSignIn = res;
        })
      );

      const { result } = renderAuth();

      act(() => {
        result.current.signIn("a@b.com", "password1");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn({ success: false });
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("is true while signUp is in-flight", async () => {
      let resolveSignUp!: (v: { success: boolean }) => void;
      mockSignUpAction.mockReturnValue(
        new Promise((res) => {
          resolveSignUp = res;
        })
      );

      const { result } = renderAuth();

      act(() => {
        result.current.signUp("a@b.com", "password1");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignUp({ success: false });
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false even when signIn throws", async () => {
      mockSignInAction.mockRejectedValue(new Error("network error"));

      const { result } = renderAuth();

      await act(async () => {
        await result.current.signIn("a@b.com", "password1").catch(() => {});
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading to false even when signUp throws", async () => {
      mockSignUpAction.mockRejectedValue(new Error("network error"));

      const { result } = renderAuth();

      await act(async () => {
        await result.current.signUp("a@b.com", "password1").catch(() => {});
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // signIn
  // -----------------------------------------------------------------------

  describe("signIn", () => {
    test("calls the signIn action with the provided credentials", async () => {
      mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signIn("user@example.com", "mypassword");
      });

      expect(mockSignInAction).toHaveBeenCalledOnce();
      expect(mockSignInAction).toHaveBeenCalledWith("user@example.com", "mypassword");
    });

    test("returns the result from the action", async () => {
      const actionResult = { success: false, error: "Invalid credentials" };
      mockSignInAction.mockResolvedValue(actionResult);

      const { result } = renderAuth();
      let returned: unknown;
      await act(async () => {
        returned = await result.current.signIn("user@example.com", "bad");
      });

      expect(returned).toEqual(actionResult);
    });

    test("does not navigate when sign-in fails", async () => {
      mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signIn("user@example.com", "bad");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    test("navigates to new project when no anon work and no existing projects", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "fresh-project" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signIn("user@example.com", "password1");
      });

      expect(mockPush).toHaveBeenCalledWith("/fresh-project");
    });

    test("navigates to the most recent existing project when no anon work", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([{ id: "project-abc" }, { id: "project-xyz" }]);

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signIn("user@example.com", "password1");
      });

      expect(mockPush).toHaveBeenCalledWith("/project-abc");
      expect(mockCreateProject).not.toHaveBeenCalled();
    });

    test("migrates anon work to a new project when messages are present", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      const anonWork = {
        messages: [{ role: "user", content: "hello" }],
        fileSystemData: { "/": { type: "dir" } },
      };
      mockGetAnonWorkData.mockReturnValue(anonWork);
      mockCreateProject.mockResolvedValue({ id: "migrated-project" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signIn("user@example.com", "password1");
      });

      expect(mockCreateProject).toHaveBeenCalledWith({
        name: expect.stringMatching(/^Design from /),
        messages: anonWork.messages,
        data: anonWork.fileSystemData,
      });
      expect(mockClearAnonWork).toHaveBeenCalled();
      expect(mockGetProjects).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/migrated-project");
    });

    test("skips anon work migration when messages array is empty", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
      mockGetProjects.mockResolvedValue([{ id: "existing-project" }]);

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signIn("user@example.com", "password1");
      });

      expect(mockCreateProject).not.toHaveBeenCalled();
      expect(mockClearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/existing-project");
    });
  });

  // -----------------------------------------------------------------------
  // signUp
  // -----------------------------------------------------------------------

  describe("signUp", () => {
    test("calls the signUp action with the provided credentials", async () => {
      mockSignUpAction.mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signUp("new@example.com", "securepass");
      });

      expect(mockSignUpAction).toHaveBeenCalledOnce();
      expect(mockSignUpAction).toHaveBeenCalledWith("new@example.com", "securepass");
    });

    test("returns the result from the action", async () => {
      const actionResult = { success: false, error: "Email already registered" };
      mockSignUpAction.mockResolvedValue(actionResult);

      const { result } = renderAuth();
      let returned: unknown;
      await act(async () => {
        returned = await result.current.signUp("existing@example.com", "pass1234");
      });

      expect(returned).toEqual(actionResult);
    });

    test("does not navigate when sign-up fails", async () => {
      mockSignUpAction.mockResolvedValue({ success: false, error: "Email already registered" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signUp("existing@example.com", "pass1234");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    test("navigates to new project after successful sign-up with no anon work", async () => {
      mockSignUpAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "brand-new-project" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signUp("new@example.com", "password1");
      });

      expect(mockPush).toHaveBeenCalledWith("/brand-new-project");
    });

    test("migrates anon work after successful sign-up when messages are present", async () => {
      mockSignUpAction.mockResolvedValue({ success: true });
      const anonWork = {
        messages: [{ role: "user", content: "build a form" }],
        fileSystemData: { "/": { type: "dir" }, "/App.tsx": { type: "file" } },
      };
      mockGetAnonWorkData.mockReturnValue(anonWork);
      mockCreateProject.mockResolvedValue({ id: "signup-migrated" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signUp("new@example.com", "password1");
      });

      expect(mockCreateProject).toHaveBeenCalledWith({
        name: expect.stringMatching(/^Design from /),
        messages: anonWork.messages,
        data: anonWork.fileSystemData,
      });
      expect(mockClearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/signup-migrated");
    });
  });

  // -----------------------------------------------------------------------
  // post-sign-in routing — createProject payload
  // -----------------------------------------------------------------------

  describe("new project creation", () => {
    test("passes empty messages and data when creating a blank project", async () => {
      mockSignInAction.mockResolvedValue({ success: true });
      mockGetAnonWorkData.mockReturnValue(null);
      mockGetProjects.mockResolvedValue([]);
      mockCreateProject.mockResolvedValue({ id: "blank" });

      const { result } = renderAuth();
      await act(async () => {
        await result.current.signIn("user@example.com", "password1");
      });

      expect(mockCreateProject).toHaveBeenCalledWith({
        name: expect.any(String),
        messages: [],
        data: {},
      });
    });
  });
});
