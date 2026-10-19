import { useAnalytics } from '@documenso/lib/client-only/hooks/use-analytics';
import { zEmail } from '@documenso/lib/utils/zod';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { RadioGroupSegmented, RadioGroupSegmentedItem } from '@documenso/ui/primitives/radio-group';
import { Textarea } from '@documenso/ui/primitives/textarea';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

const ZRejectDocumentReasonFormSchema = z.object({
  reason: z.string().max(500, msg`Reason must be less than 500 characters`),
});

type TRejectDocumentReasonFormSchema = z.infer<typeof ZRejectDocumentReasonFormSchema>;

const ZRejectDocumentRedirectFormSchema = z.object({
  redirectName: z.string().trim().min(1, msg`Name is required`),
  redirectEmail: zEmail({ message: msg`Please enter a valid email address`.id }).min(1, msg`Email is required`),
});

type TRejectDocumentRedirectFormSchema = z.infer<typeof ZRejectDocumentRedirectFormSchema>;

/**
 * `redirect` asks the recipient for the right signer's name and email so the sender can
 * redirect the document to them. `reject` is the original free-text rejection. Both end up
 * calling the same `rejectDocumentWithToken` mutation; only the composed `reason` differs.
 */
type RejectDialogMode = 'redirect' | 'reject';

export interface DocumentSigningRejectDialogProps {
  documentId: number;
  token: string;
  onRejected?: (reason: string) => void | Promise<void>;
  trigger?: React.ReactNode;
}

export function DocumentSigningRejectDialog({
  documentId,
  token,
  onRejected,
  trigger,
}: DocumentSigningRejectDialogProps) {
  const { t } = useLingui();
  const { toast } = useToast();
  const analytics = useAnalytics();
  const [searchParams] = useSearchParams();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<RejectDialogMode>('redirect');

  const { mutateAsync: rejectDocumentWithToken } = trpc.recipient.rejectDocumentWithToken.useMutation();

  const reasonForm = useForm<TRejectDocumentReasonFormSchema>({
    resolver: zodResolver(ZRejectDocumentReasonFormSchema),
    defaultValues: {
      reason: '',
    },
  });

  const redirectForm = useForm<TRejectDocumentRedirectFormSchema>({
    resolver: zodResolver(ZRejectDocumentRedirectFormSchema),
    defaultValues: {
      redirectName: '',
      redirectEmail: '',
    },
  });

  const submitRejection = async (reason: string) => {
    try {
      await rejectDocumentWithToken({
        documentId,
        token,
        reason,
      });

      toast({
        title: t`Document rejected`,
        description: t`The document has been successfully rejected.`,
        duration: 5000,
      });

      setIsOpen(false);

      if (onRejected) {
        await onRejected(reason);
      } else {
        window.location.href = `/sign/${token}/rejected`;
      }
    } catch (err) {
      analytics.captureException(err, {
        source: 'signing',
        location: 'reject_document',
        documentId,
      });

      toast({
        title: t`Error`,
        description: t`An error occurred while rejecting the document. Please try again.`,
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  const onRejectDocument = async ({ reason }: TRejectDocumentReasonFormSchema) => {
    await submitRejection(reason);
  };

  const onRedirectDocument = async ({ redirectName, redirectEmail }: TRejectDocumentRedirectFormSchema) => {
    // Portal contract: the backend recognises this exact `[REDIRECTION] <name> <<email>>` shape
    // in `reason` to redirect the quote to the right signer automatically. Keep it byte for byte.
    await submitRejection(`[REDIRECTION] ${redirectName} <${redirectEmail}>`);
  };

  useEffect(() => {
    if (searchParams?.get('reject') === 'true') {
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setMode('redirect');
      reasonForm.reset();
      redirectForm.reset();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Trans>Reject Document</Trans>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Reject Document</Trans>
          </DialogTitle>

          <DialogDescription>
            <Trans>Are you sure you want to reject this document? This action cannot be undone.</Trans>
          </DialogDescription>
        </DialogHeader>

        <RadioGroupSegmented
          value={mode}
          onValueChange={(value) => setMode(value as RejectDialogMode)}
          aria-label={t`Rejection type`}
        >
          <RadioGroupSegmentedItem value="redirect">
            <Trans>This isn't me</Trans>
          </RadioGroupSegmentedItem>
          <RadioGroupSegmentedItem value="reject">
            <Trans>I reject this document</Trans>
          </RadioGroupSegmentedItem>
        </RadioGroupSegmented>

        {mode === 'redirect' ? (
          <Form {...redirectForm}>
            <form onSubmit={redirectForm.handleSubmit(onRedirectDocument)} className="space-y-4">
              <FormField
                control={redirectForm.control}
                name="redirectName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      <Trans>Name</Trans>
                    </FormLabel>
                    <FormControl>
                      <Input disabled={redirectForm.formState.isSubmitting} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={redirectForm.control}
                name="redirectEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      <Trans>Email</Trans>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="example@example.com"
                        disabled={redirectForm.formState.isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  disabled={redirectForm.formState.isSubmitting}
                >
                  <Trans>Cancel</Trans>
                </Button>

                <Button
                  type="submit"
                  variant="destructive"
                  loading={redirectForm.formState.isSubmitting}
                  disabled={!redirectForm.formState.isValid}
                >
                  <Trans>Reject Document</Trans>
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <Form {...reasonForm}>
            <form onSubmit={reasonForm.handleSubmit(onRejectDocument)} className="space-y-4">
              <FormField
                control={reasonForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        placeholder={t`Please provide a reason for rejecting this document`}
                        disabled={reasonForm.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsOpen(false)}
                  disabled={reasonForm.formState.isSubmitting}
                >
                  <Trans>Cancel</Trans>
                </Button>

                <Button
                  type="submit"
                  variant="destructive"
                  loading={reasonForm.formState.isSubmitting}
                  disabled={!reasonForm.formState.isValid}
                >
                  <Trans>Reject Document</Trans>
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
